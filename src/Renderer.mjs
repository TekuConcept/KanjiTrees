/**
 * This is where all the fun graphics logic goes
 */

import Matter from './matter.mjs'
import Relation from './Relation.mjs'
import EventEmitter from './EventEmitter.mjs'

const MOUSE_LEFT   = 0
const MOUSE_MIDDLE = 1
const MOUSE_RIGHT  = 2

export default class Renderer extends EventEmitter {
    static _requestAnimationFrame = undefined
    static _cancelAnimationFrame = undefined
    static _goodFps = 30
    static _goodDelta = 1000 / 60
    static _construct = (() => {
        let fnreq =
            window.requestAnimationFrame ||
            // @ts-ignore
            window.webkitRequestAnimationFrame ||
            // @ts-ignore
            window.mozRequestAnimationFrame ||
            // @ts-ignore
            window.msRequestAnimationFrame ||
            function(callback) {
                window.setTimeout(function() {
                    callback(Matter.Common.now())
                }, 1000 / 60)
            }
        Renderer._requestAnimationFrame = (cb) => fnreq.call(window, cb)

        let fncan =
            window.cancelAnimationFrame ||
            // @ts-ignore
            window.mozCancelAnimationFrame ||
            // @ts-ignore
            window.webkitCancelAnimationFrame ||
            // @ts-ignore
            window.msCancelAnimationFrame
        Renderer._cancelAnimationFrame = (id) => fncan.call(window, id)
    })()

    /**
     * @param {any} options
     */
    constructor(options) {
        super()
        var defaults = {
            controller: Matter.Render,
            engine: null,
            element: null,
            canvas: null,
            mouse: null,
            frameRequestId: null,
            timing: {
                historySize: 60,
                delta: 0,
                deltaHistory: [],
                lastTime: 0,
                lastTimestamp: 0,
                lastElapsed: 0,
                timestampElapsed: 0,
                timestampElapsedHistory: [],
                engineDeltaHistory: [],
                engineElapsedHistory: [],
                elapsedHistory: []
            },
            options: {
                width: 800,
                height: 600,
                pixelRatio: 1,
                background: '#14151f',
                wireframeBackground: '#14151f',
                hasBounds: !!options.bounds,
                enabled: true,
                wireframes: true,
                showRelations: true,
                showSleeping: true,
                showDebug: false,
                showStats: false,
                showPerformance: false,
                showBroadphase: false,
                showBounds: false,
                showVelocity: false,
                showCollisions: false,
                showSeparations: false,
                showAxes: false,
                showPositions: false,
                showAngleIndicator: false,
                showIds: false,
                showVertexNumbers: false,
                showConvexHulls: false,
                showInternalEdges: false,
                showMousePosition: false
            }
        };

        this.ctx = Matter.Common.extend(defaults, options);

        // if (this.ctx.canvas) {
        //     this.ctx.canvas.width = this.ctx.options.width || this.ctx.canvas.width;
        //     this.ctx.canvas.height = this.ctx.options.height || this.ctx.canvas.height;
        // }

        this.ctx.mouse = options.mouse
        this.ctx.engine = options.engine
        this.ctx.canvas = this._createCanvas(
            window.innerWidth, window.innerHeight)
        this.ctx.context = this.ctx.canvas.getContext('2d')
        this.ctx.textures = {}

        window.onresize = (/** @type {UIEvent} */ ev) => this.__handleWindowResize.call(this, ev)

        this.ctx.bounds = this.ctx.bounds || {
            min: { x: 0, y: 0 },
            max: {
                x: this.ctx.canvas.width,
                y: this.ctx.canvas.height
            }
        }

        if (this.ctx.options.pixelRatio !== 1)
        { this.setPixelRatio(this.ctx.options.pixelRatio) }

        if (Matter.Common.isElement(this.ctx.element))
        { this.ctx.element.appendChild(this.ctx.canvas) }
        else if (!this.ctx.canvas.parentNode) {
            Matter.Common.log(
                'Render.create: options.element was undefined, ' +
                'render.canvas was created but not appended', 'warn')
        }
    }

    __handleWindowResize() {
        this.ctx.canvas.width = window.innerWidth
        this.ctx.canvas.height = window.innerHeight
        this.bgimg = this.ctx.context.getImageData(
            0, 0, window.innerWidth, window.innerHeight)
        if (this.ctx.mouse) Matter.Mouse.setOffset(this.ctx.mouse, {x:0,y:0})
        this.emit('resize', {width:window.innerWidth,height:window.innerHeight})
    }

    /**
     * Continuously updates the render canvas on the `requestAnimationFrame` event.
     * @method run
     */
    run() {
        this.bgimg = this.ctx.context.getImageData(
            0, 0, window.innerWidth, window.innerHeight)
        this._loop()
    }

    resume() { this._loop() }

    /**
     * @param {any} [time]
     */
    _loop(time) {
        this.ctx.frameRequestId = Renderer._requestAnimationFrame(
            n => this._loop.call(this,n))

        this._updateTiming(time)
        this.world(time)

        if (this.ctx.options.showStats || this.ctx.options.showDebug)
        { this.stats(this.ctx.context, time) }

        if (this.ctx.options.showPerformance || this.ctx.options.showDebug)
        { this.performance(this.ctx.context/*, time*/) }
    }

    /**
     * Ends execution of `Render.run` on the given `render`, by canceling the animation frame request event loop.
     * @method stop
     */
    stop() {
        Renderer._cancelAnimationFrame(this.ctx.frameRequestId)
    }

    /**
     * Sets the pixel ratio of the renderer and updates the canvas.
     * To automatically detect the correct ratio, pass the string `'auto'` for `pixelRatio`.
     * @method setPixelRatio
     * @param {number|'auto'} pixelRatio
     */
    setPixelRatio(pixelRatio) {
        let options = this.ctx.options
        let canvas = this.ctx.canvas

        if (pixelRatio === 'auto')
        { pixelRatio = this._getPixelRatio(canvas) }

        options.pixelRatio = pixelRatio
        canvas.setAttribute('data-pixel-ratio', pixelRatio)
        canvas.width        = options.width * pixelRatio
        canvas.height       = options.height * pixelRatio
        canvas.style.width  = options.width + 'px'
        canvas.style.height = options.height + 'px'
    }

    /**
     * Positions and sizes the viewport around the given object bounds.
     * Objects must have at least one of the following properties:
     * - `object.bounds`
     * - `object.position`
     * - `object.min` and `object.max`
     * - `object.x` and `object.y`
     * @method lookAt
     * @param {object[]} objects
     * @param {Matter.Vector} [padding]
     * @param {boolean} [center=true]
     */
    lookAt(objects, padding, center) {
        center = typeof center !== 'undefined' ? center : true
        objects = Matter.Common.isArray(objects) ? objects : [objects]
        padding = padding || { x: 0, y: 0 }

        // find bounds of all objects
        let bounds = {
            min: { x: Infinity, y: Infinity },
            max: { x: -Infinity, y: -Infinity }
        }

        for (let i = 0; i < objects.length; i += 1) {
            let object = objects[i]
            let min = object.bounds ? object.bounds.min : (object.min || object.position || object)
            let max = object.bounds ? object.bounds.max : (object.max || object.position || object)

            if (min && max) {
                if (min.x < bounds.min.x)
                    bounds.min.x = min.x

                if (max.x > bounds.max.x)
                    bounds.max.x = max.x

                if (min.y < bounds.min.y)
                    bounds.min.y = min.y

                if (max.y > bounds.max.y)
                    bounds.max.y = max.y
            }
        }

        // find ratios
        let width = (bounds.max.x - bounds.min.x) + 2 * padding.x
        let height = (bounds.max.y - bounds.min.y) + 2 * padding.y
        let viewHeight = this.ctx.canvas.height
        let viewWidth = this.ctx.canvas.width
        let outerRatio = viewWidth / viewHeight
        let innerRatio = width / height
        let scaleX = 1
        let scaleY = 1

        // find scale factor
        if (innerRatio > outerRatio)
        { scaleY = innerRatio / outerRatio }
        else { scaleX = outerRatio / innerRatio }

        // enable bounds
        this.ctx.options.hasBounds = true

        // position and size
        this.ctx.bounds.min.x = bounds.min.x
        this.ctx.bounds.max.x = bounds.min.x + width * scaleX
        this.ctx.bounds.min.y = bounds.min.y
        this.ctx.bounds.max.y = bounds.min.y + height * scaleY

        // center
        if (center) {
            this.ctx.bounds.min.x += width * 0.5 - (width * scaleX) * 0.5
            this.ctx.bounds.max.x += width * 0.5 - (width * scaleX) * 0.5
            this.ctx.bounds.min.y += height * 0.5 - (height * scaleY) * 0.5
            this.ctx.bounds.max.y += height * 0.5 - (height * scaleY) * 0.5
        }

        // padding
        this.ctx.bounds.min.x -= padding.x
        this.ctx.bounds.max.x -= padding.x
        this.ctx.bounds.min.y -= padding.y
        this.ctx.bounds.max.y -= padding.y

        // update mouse
        if (this.ctx.mouse) {
            Matter.Mouse.setScale(this.ctx.mouse, {
                x: (this.ctx.bounds.max.x - this.ctx.bounds.min.x) / this.ctx.canvas.width,
                y: (this.ctx.bounds.max.y - this.ctx.bounds.min.y) / this.ctx.canvas.height
            })
            Matter.Mouse.setOffset(this.ctx.mouse, this.ctx.bounds.min)
        }
    }

    /**
     * Applies viewport transforms based on `render.bounds` to a render context.
     * @method startViewTransform
     */
    startViewTransform() {
        let boundsWidth = this.ctx.bounds.max.x - this.ctx.bounds.min.x
        let boundsHeight = this.ctx.bounds.max.y - this.ctx.bounds.min.y
        let boundsScaleX = boundsWidth / this.ctx.options.width
        let boundsScaleY = boundsHeight / this.ctx.options.height

        this.ctx.context.setTransform(
            this.ctx.options.pixelRatio / boundsScaleX, 0, 0, 
            this.ctx.options.pixelRatio / boundsScaleY, 0, 0
        )

        this.ctx.context.translate(-this.ctx.bounds.min.x, -this.ctx.bounds.min.y)
    }

    /**
     * Resets all transforms on the render context.
     * @method endViewTransform
     */
    endViewTransform() {
        this.ctx.context.setTransform(
            this.ctx.options.pixelRatio, 0, 0,
            this.ctx.options.pixelRatio, 0, 0)
    }

    /**
     * Renders the given `engine`'s `Matter.World` object.
     * This is the entry point for all rendering and should be called every time the scene changes.
     * @method world
     * @param {any} time
     */
    world(time) {
        let startTime = Matter.Common.now()
        let engine    = this.ctx.engine
        let world     = engine.world
        let canvas    = this.ctx.canvas
        let context   = this.ctx.context
        let options   = this.ctx.options
        let timing    = this.ctx.timing

        let allBodies = Matter.Composite.allBodies(world)
        let allConstraints = Matter.Composite.allConstraints(world)
        let allRelations = Matter.Composite.allRelations(world)
        let background = options.wireframes ? options.wireframeBackground : options.background
        let bodies = []
        let constraints = []
        let relations = []
        let i

        let event = { timestamp: engine.timing.timestamp }

        // Matter.Events.trigger(this.ctx, 'beforeRender', event)
        this.emit('beforeRender', event)

        // apply background if it has changed
        // if (this.ctx.currentBackground !== background)
        //     this._applyBackground(background)
        this.ctx.context.putImageData(this.bgimg, 0, 0)
        this.emit('preDraw', this.ctx.context)

        // clear the canvas with a transparent fill, to allow the canvas background to show
        // context.globalCompositeOperation = 'source-in'
        // context.fillStyle = "transparent"
        // context.fillRect(0, 0, canvas.width, canvas.height)
        // context.globalCompositeOperation = 'source-over'

        // handle bounds
        if (options.hasBounds) {
            // filter out bodies that are not in view
            for (i = 0; i < allBodies.length; i++) {
                let body = allBodies[i]
                if (Matter.Bounds.overlaps(body.bounds, this.ctx.bounds))
                    bodies.push(body)
            }

            // filter out constraints that are not in view
            for (i = 0; i < allConstraints.length; i++) {
                let constraint  = allConstraints[i]
                let bodyA       = constraint.bodyA
                let bodyB       = constraint.bodyB
                let pointAWorld = constraint.pointA
                let pointBWorld = constraint.pointB

                if (bodyA) pointAWorld = Matter.Vector.add(bodyA.position, constraint.pointA)
                if (bodyB) pointBWorld = Matter.Vector.add(bodyB.position, constraint.pointB)

                if (!pointAWorld || !pointBWorld)
                    continue

                if (Matter.Bounds.contains(this.ctx.bounds, pointAWorld) ||
                    Matter.Bounds.contains(this.ctx.bounds, pointBWorld))
                    constraints.push(constraint)
            }

            // filter out relations that are not in view
            for (i = 0; i < allRelations.length; i++) {
                let relation  = allRelations[i]
                let pointAWorld = relation.pointA
                let pointBWorld = relation.pointB

                if (!pointAWorld || !pointBWorld)
                    continue

                if (Matter.Bounds.contains(this.ctx.bounds, pointAWorld) ||
                    Matter.Bounds.contains(this.ctx.bounds, pointBWorld))
                    relations.push(relation)
            }

            // transform the view
            this.startViewTransform()

            // update mouse
            if (this.ctx.mouse) {
                Matter.Mouse.setScale(this.ctx.mouse, {
                    x: (this.ctx.bounds.max.x - this.ctx.bounds.min.x) / this.ctx.options.width,
                    y: (this.ctx.bounds.max.y - this.ctx.bounds.min.y) / this.ctx.options.height
                })

                Matter.Mouse.setOffset(this.ctx.mouse, this.ctx.bounds.min)
            }
        }
        else {
            constraints = allConstraints
            bodies = allBodies
            relations = allRelations

            if (this.ctx.options.pixelRatio !== 1) {
                this.ctx.context.setTransform(
                    this.ctx.options.pixelRatio, 0, 0,
                    this.ctx.options.pixelRatio, 0, 0)
            }
        }

        if (options.showRelations)
            this.relations(relations, context)

        if (!options.wireframes || (engine.enableSleeping && options.showSleeping)) {
            // fully featured rendering of bodies
            this.bodies(bodies, context)
        }
        else {
            if (options.showConvexHulls)
                this.bodyConvexHulls(bodies, context)

            // optimised method for wireframes only
            this.bodyWireframes(bodies, context)
        }

        if (options.showBounds)
            this.bodyBounds(bodies, context)

        if (options.showAxes || options.showAngleIndicator)
            this.bodyAxes(bodies, context)

        if (options.showPositions)
            this.bodyPositions(bodies, context)

        if (options.showVelocity)
            this.bodyVelocity(bodies, context)

        if (options.showIds)
            this.bodyIds(bodies, context)

        if (options.showSeparations)
            this.separations(engine.pairs.list, context)

        if (options.showCollisions)
            this.collisions(engine.pairs.list, context)

        if (options.showVertexNumbers)
            this.vertexNumbers(bodies, context)

        if (options.showMousePosition)
            this.mousePosition(this.ctx.mouse, context)

        this.constraints(constraints, context)

        if (options.showBroadphase)
            this.grid(engine.grid, context)

        this.emit('postDraw', this.ctx.context)
        if (options.hasBounds) {
            // revert view transforms
            this.endViewTransform()
        }

        // Matter.Events.trigger(this.ctx, 'afterRender', event)
        this.emit('afterRender', event)

        // log the time elapsed computing this update
        timing.lastElapsed = Matter.Common.now() - startTime
    }

    /**
     * Renders statistics about the engine and world useful for debugging.
     * @private
     * @method stats
     * @param {CanvasRenderingContext2D} context
     * @param {Number} time
     */
    stats(context, time) {
        let engine = this.ctx.engine
        let world = engine.world
        let bodies = Matter.Composite.allBodies(world)
        let parts = 0
        let width = 55
        let height = 44
        let x = 0
        let y = 0

        // count parts
        for (let i = 0; i < bodies.length; i += 1)
        { parts += bodies[i].parts.length }

        // sections
        let sections = {
            'Part': parts,
            'Body': bodies.length,
            'Cons': Matter.Composite.allConstraints(world).length,
            'Comp': Matter.Composite.allComposites(world).length,
            'Pair': engine.pairs.list.length
        }

        // background
        context.fillStyle = '#0e0f19'
        context.fillRect(x, y, width * 5.5, height)

        context.font = '12px Arial'
        context.textBaseline = 'top'
        context.textAlign = 'right'

        // sections
        for (let key in sections) {
            let section = sections[key]
            // label
            context.fillStyle = '#aaa'
            context.fillText(key, x + width, y + 8)

            // value
            context.fillStyle = '#eee'
            context.fillText(section, x + width, y + 26)

            x += width
        }
    }

    /**
     * Renders engine and render performance information.
     * @private
     * @method performance
     * @param {CanvasRenderingContext2D} context
     */
    performance(context) {
        let engine = this.ctx.engine
        let timing = this.ctx.timing
        let deltaHistory = timing.deltaHistory
        let elapsedHistory = timing.elapsedHistory
        let timestampElapsedHistory = timing.timestampElapsedHistory
        let engineDeltaHistory = timing.engineDeltaHistory
        let engineElapsedHistory = timing.engineElapsedHistory
        let lastEngineDelta = engine.timing.lastDelta

        let deltaMean = this._mean(deltaHistory)
        let elapsedMean = this._mean(elapsedHistory)
        let engineDeltaMean = this._mean(engineDeltaHistory)
        let engineElapsedMean = this._mean(engineElapsedHistory)
        let timestampElapsedMean = this._mean(timestampElapsedHistory)
        let rateMean = (timestampElapsedMean / deltaMean) || 0
        let fps = (1000 / deltaMean) || 0

        let graphHeight = 4
        let gap = 12
        let width = 60
        let height = 34
        let x = 10
        let y = 69

        // background
        context.fillStyle = '#0e0f19'
        context.fillRect(0, 50, gap * 4 + width * 5 + 22, height)

        // show FPS
        this.status(
            context, x, y, width, graphHeight, deltaHistory.length,
            Math.round(fps) + ' fps',
            fps / Renderer._goodFps,
            function(i) { return (deltaHistory[i] / deltaMean) - 1 }
        )

        // show engine delta
        this.status(
            context, x + gap + width, y, width, graphHeight, engineDeltaHistory.length,
            lastEngineDelta.toFixed(2) + ' dt',
            Renderer._goodDelta / lastEngineDelta,
            function(i) { return (engineDeltaHistory[i] / engineDeltaMean) - 1 }
        )

        // show engine update time
        this.status(
            context, x + (gap + width) * 2, y, width, graphHeight, engineElapsedHistory.length,
            engineElapsedMean.toFixed(2) + ' ut',
            1 - (engineElapsedMean / Renderer._goodFps),
            function(i) { return (engineElapsedHistory[i] / engineElapsedMean) - 1 }
        )

        // show render time
        this.status(
            context, x + (gap + width) * 3, y, width, graphHeight, elapsedHistory.length,
            elapsedMean.toFixed(2) + ' rt',
            1 - (elapsedMean / Renderer._goodFps),
            function(i) { return (elapsedHistory[i] / elapsedMean) - 1 }
        )

        // show effective speed
        this.status(
            context, x + (gap + width) * 4, y, width, graphHeight, timestampElapsedHistory.length,
            rateMean.toFixed(2) + ' x',
            rateMean * rateMean * rateMean,
            function(i) { return (((timestampElapsedHistory[i] / deltaHistory[i]) / rateMean) || 0) - 1 }
        )
    }

    /**
     * Renders a label, indicator and a chart.
     * @private
     * @method status
     * @param {CanvasRenderingContext2D} context
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     * @param {number} count
     * @param {string} label
     * @param {number} indicator
     * @param {function} plotY
     */
    status(context, x, y, width, height, count, label, indicator, plotY) {
        // background
        context.strokeStyle = '#888'
        context.fillStyle = '#444'
        context.lineWidth = 1
        context.fillRect(x, y + 7, width, 1)

        // chart
        context.beginPath()
        context.moveTo(x, y + 7 - height * Matter.Common.clamp(0.4 * plotY(0), -2, 2))
        for (var i = 0; i < width; i += 1) {
            context.lineTo(
                x + i,
                y + 7 - (i < count ? height * Matter.Common.clamp(0.4 * plotY(i), -2, 2) : 0))
        }
        context.stroke()

        // indicator
        context.fillStyle = 'hsl(' + Matter.Common.clamp(25 + 95 * indicator, 0, 120) + ',100%,60%)'
        context.fillRect(x, y - 7, 4, 4)

        // label
        context.font = '12px Arial'
        context.textBaseline = 'middle'
        context.textAlign = 'right'
        context.fillStyle = '#eee'
        context.fillText(label, x + width, y - 5)
    }

    /**
     * Description
     * @private
     * @method constraints
     * @param {Matter.Constraint[]} constraints
     * @param {CanvasRenderingContext2D} context
     */
    constraints(constraints, context) {
        let c = context

        for (let i = 0; i < constraints.length; i++) {
            let constraint = constraints[i]

            if (!constraint.render.visible || !constraint.pointA || !constraint.pointB)
                continue

            let bodyA = constraint.bodyA
            let bodyB = constraint.bodyB
            let start, end

            if (bodyA)
            { start = Matter.Vector.add(bodyA.position, constraint.pointA) }
            else { start = constraint.pointA }

            if (constraint.render.type === 'pin') {
                c.beginPath()
                c.arc(start.x, start.y, 3, 0, 2 * Math.PI)
                c.closePath()
            }
            else {
                if (bodyB)
                { end = Matter.Vector.add(bodyB.position, constraint.pointB) }
                else { end = constraint.pointB }

                c.beginPath();
                c.moveTo(start.x, start.y);

                if (constraint.render.type === 'spring') {
                    let delta = Matter.Vector.sub(end, start)
                    let normal = Matter.Vector.perp(Matter.Vector.normalise(delta))
                    let coils = Math.ceil(Matter.Common.clamp(constraint.length / 5, 12, 20))
                    let offset

                    for (let j = 1; j < coils; j += 1) {
                        offset = j % 2 === 0 ? 1 : -1

                        c.lineTo(
                            start.x + delta.x * (j / coils) + normal.x * offset * 4,
                            start.y + delta.y * (j / coils) + normal.y * offset * 4
                        )
                    }
                }

                c.lineTo(end.x, end.y)
            }

            if (constraint.render.lineWidth) {
                c.lineWidth = constraint.render.lineWidth
                c.strokeStyle = constraint.render.strokeStyle
                c.stroke()
            }

            if (constraint.render.anchors) {
                c.fillStyle = constraint.render.strokeStyle
                c.beginPath()
                c.arc(start.x, start.y, 3, 0, 2 * Math.PI)
                c.arc(end.x, end.y, 3, 0, 2 * Math.PI)
                c.closePath()
                c.fill()
            }
        }
    }

    /**
     * Description
     * @private
     * @method relations
     * @param {Relation[]} relations
     * @param {CanvasRenderingContext2D} context
     */
    relations(relations, context) {
        for (let i = 0; i < relations.length; i++) {
            if (!relations[i].render.visible) continue
            context.beginPath()
            let a = relations[i].pointA
            let b = relations[i].pointB
            context.moveTo(a.x, a.y)
            context.lineTo(b.x, b.y)
            context.strokeStyle = relations[i].render.strokeStyle
            context.lineWidth = relations[i].render.lineWidth
            context.stroke()
        }
    }

    /**
     * Description
     * @private
     * @method bodies
     * @param {Matter.Body[]} bodies
     * @param {CanvasRenderingContext2D} context
     */
    bodies(bodies, context) {
        let c = context
        let engine = this.ctx.engine
        let options = this.ctx.options
        let showInternalEdges = options.showInternalEdges || !options.wireframes
        let body, part
        let i, k

        for (i = 0; i < bodies.length; i++) {
            body = bodies[i]

            if (!body.render.visible)
                continue

            // handle compound parts
            for (k = body.parts.length > 1 ? 1 : 0; k < body.parts.length; k++) {
                part = body.parts[k]

                if (!part.render.visible)
                    continue

                if (options.showSleeping && body.isSleeping)
                { c.globalAlpha = 0.5 * part.render.opacity }
                else if (part.render.opacity !== 1)
                { c.globalAlpha = part.render.opacity }

                if (part.render.sprite && part.render.sprite.texture && !options.wireframes) {
                    // part sprite
                    let sprite = part.render.sprite
                    let texture = this._getTexture(sprite.texture)

                    c.translate(part.position.x, part.position.y)
                    c.rotate(part.angle)

                    c.drawImage(
                        texture,
                        // @ts-ignore
                        texture.width * -sprite.xOffset * sprite.xScale,
                        // @ts-ignore
                        texture.height * -sprite.yOffset * sprite.yScale,
                        texture.width * sprite.xScale,
                        texture.height * sprite.yScale
                    )

                    // revert translation, hopefully faster than save / restore
                    c.rotate(-part.angle)
                    c.translate(-part.position.x, -part.position.y)
                }
                else {
                    // part polygon
                    if (part.circleRadius) {
                        c.beginPath()
                        c.arc(part.position.x, part.position.y, part.circleRadius, 0, 2 * Math.PI)
                    }
                    else {
                        c.beginPath()
                        c.moveTo(part.vertices[0].x, part.vertices[0].y)

                        for (var j = 1; j < part.vertices.length; j++) {
                            // @ts-ignore
                            if (!part.vertices[j - 1].isInternal || showInternalEdges)
                            { c.lineTo(part.vertices[j].x, part.vertices[j].y) }
                            else { c.moveTo(part.vertices[j].x, part.vertices[j].y) }

                            // @ts-ignore
                            if (part.vertices[j].isInternal && !showInternalEdges) {
                                c.moveTo(
                                    part.vertices[(j + 1) % part.vertices.length].x,
                                    part.vertices[(j + 1) % part.vertices.length].y)
                            }
                        }

                        c.lineTo(part.vertices[0].x, part.vertices[0].y)
                        c.closePath()
                    }

                    if (!options.wireframes) {
                        c.fillStyle = part.render.fillStyle

                        if (part.render.lineWidth) {
                            c.lineWidth = part.render.lineWidth
                            c.strokeStyle = part.render.strokeStyle
                            c.stroke()
                        }

                        c.fill()
                    }
                    else {
                        c.lineWidth = 1
                        c.strokeStyle = '#bbb'
                        c.stroke()
                    }
                }

                // @ts-ignore
                let text = part.render.text
                if (text && text.value) {
                    let font      = c.font
                    let fillStyle = c.fillStyle
                    let textAlign = c.textAlign
                    let yOffset   = 0
                    if (text.fontsize || text.fontfamily) {
                        let fontsize = text.fontsize || 15
                        let fontfamily = text.fontfamily || 'sans-serif'
                        c.font = `${fontsize}px ${fontfamily}`
                        yOffset = (4 / 15) * fontsize
                    }
                    c.fillStyle = text.color || fillStyle
                    c.textAlign = text.textalign || textAlign
                    c.fillText(
                        text.value,
                        part.position.x,
                        part.position.y + yOffset)
                    c.font      = font
                    c.fillStyle = fillStyle
                    c.textAlign = textAlign
                }

                c.globalAlpha = 1
            }
        }
    }

    /**
     * Optimised method for drawing body wireframes in one pass
     * @private
     * @method bodyWireframes
     * @param {Matter.Body[]} bodies
     * @param {CanvasRenderingContext2D} context
     */
    bodyWireframes(bodies, context) {
        let c = context
        let showInternalEdges = this.ctx.options.showInternalEdges
        let body, part
        let i, j, k

        c.beginPath()

        // render all bodies
        for (i = 0; i < bodies.length; i++) {
            body = bodies[i]

            if (!body.render.visible)
                continue

            // handle compound parts
            for (k = body.parts.length > 1 ? 1 : 0; k < body.parts.length; k++) {
                part = body.parts[k]

                c.moveTo(part.vertices[0].x, part.vertices[0].y)

                for (j = 1; j < part.vertices.length; j++) {
                    // @ts-ignore
                    if (!part.vertices[j - 1].isInternal || showInternalEdges)
                    { c.lineTo(part.vertices[j].x, part.vertices[j].y) }
                    else { c.moveTo(part.vertices[j].x, part.vertices[j].y) }

                    // @ts-ignore
                    if (part.vertices[j].isInternal && !showInternalEdges) {
                        c.moveTo(
                            part.vertices[(j + 1) % part.vertices.length].x,
                            part.vertices[(j + 1) % part.vertices.length].y)
                    }
                }

                c.lineTo(part.vertices[0].x, part.vertices[0].y)
            }
        }

        c.lineWidth = 1
        c.strokeStyle = '#bbb'
        c.stroke()
    }

    /**
     * Optimised method for drawing body convex hull wireframes in one pass
     * @private
     * @method bodyConvexHulls
     * @param {Matter.Body[]} bodies
     * @param {CanvasRenderingContext2D} context
     */
    bodyConvexHulls(bodies, context) {
        let c = context
        let body
        let part
        let i, j, k

        c.beginPath()

        // render convex hulls
        for (i = 0; i < bodies.length; i++) {
            body = bodies[i]

            if (!body.render.visible || body.parts.length === 1)
                continue

            c.moveTo(body.vertices[0].x, body.vertices[0].y)

            for (j = 1; j < body.vertices.length; j++)
            { c.lineTo(body.vertices[j].x, body.vertices[j].y) }

            c.lineTo(body.vertices[0].x, body.vertices[0].y)
        }

        c.lineWidth = 1
        c.strokeStyle = 'rgba(255,255,255,0.2)'
        c.stroke()
    }

    /**
     * Renders body vertex numbers.
     * @private
     * @method vertexNumbers
     * @param {Matter.Body[]} bodies
     * @param {CanvasRenderingContext2D} context
     */
    vertexNumbers(bodies, context) {
        let c = context
        let i, j, k

        for (i = 0; i < bodies.length; i++) {
            let parts = bodies[i].parts
            for (k = parts.length > 1 ? 1 : 0; k < parts.length; k++) {
                let part = parts[k]
                for (j = 0; j < part.vertices.length; j++) {
                    c.fillStyle = 'rgba(255,255,255,0.2)'
                    c.fillText(
                        i + '_' + j,
                        part.position.x + (part.vertices[j].x - part.position.x) * 0.8,
                        part.position.y + (part.vertices[j].y - part.position.y) * 0.8)
                }
            }
        }
    }

    /**
     * Renders mouse position.
     * @private
     * @method mousePosition
     * @param {Matter.Mouse} mouse
     * @param {CanvasRenderingContext2D} context
     */
    mousePosition(mouse, context) {
        let c = context
        c.fillStyle = 'rgba(255,255,255,0.8)'
        c.fillText(
            mouse.position.x + '  ' + mouse.position.y,
            mouse.position.x + 5, mouse.position.y - 5)
    }

    /**
     * Draws body bounds
     * @private
     * @method bodyBounds
     * @param {Matter.Body[]} bodies
     * @param {CanvasRenderingContext2D} context
     */
    bodyBounds(bodies, context) {
        let c = context
        let engine = this.ctx.engine
        let options = this.ctx.options

        c.beginPath()

        for (let i = 0; i < bodies.length; i++) {
            let body = bodies[i]

            if (body.render.visible) {
                let parts = bodies[i].parts
                for (let j = parts.length > 1 ? 1 : 0; j < parts.length; j++) {
                    let part = parts[j]
                    c.rect(
                        part.bounds.min.x,
                        part.bounds.min.y,
                        part.bounds.max.x - part.bounds.min.x,
                        part.bounds.max.y - part.bounds.min.y)
                }
            }
        }

        if (options.wireframes)
        { c.strokeStyle = 'rgba(255,255,255,0.08)' }
        else { c.strokeStyle = 'rgba(0,0,0,0.1)' }

        c.lineWidth = 1
        c.stroke()
    }

    /**
     * Draws body angle indicators and axes
     * @private
     * @method bodyAxes
     * @param {Matter.Body[]} bodies
     * @param {CanvasRenderingContext2D} context
     */
    bodyAxes(bodies, context) {
        let c = context
        let engine = this.ctx.engine
        let options = this.ctx.options
        let part
        let i
        let j
        let k

        c.beginPath()

        for (i = 0; i < bodies.length; i++) {
            let body = bodies[i]
            let parts = body.parts

            if (!body.render.visible)
                continue

            if (options.showAxes) {
                // render all axes
                for (j = parts.length > 1 ? 1 : 0; j < parts.length; j++) {
                    part = parts[j]
                    for (k = 0; k < part.axes.length; k++) {
                        var axis = part.axes[k]
                        c.moveTo(part.position.x, part.position.y)
                        c.lineTo(part.position.x + axis.x * 20, part.position.y + axis.y * 20)
                    }
                }
            }
            else {
                for (j = parts.length > 1 ? 1 : 0; j < parts.length; j++) {
                    part = parts[j]
                    for (k = 0; k < part.axes.length; k++) {
                        // render a single axis indicator
                        c.moveTo(part.position.x, part.position.y)
                        c.lineTo((part.vertices[0].x + part.vertices[part.vertices.length-1].x) / 2,
                            (part.vertices[0].y + part.vertices[part.vertices.length-1].y) / 2)
                    }
                }
            }
        }

        if (options.wireframes) {
            c.strokeStyle = 'indianred'
            c.lineWidth = 1
        }
        else {
            c.strokeStyle = 'rgba(255, 255, 255, 0.4)'
            c.globalCompositeOperation = 'overlay'
            c.lineWidth = 2
        }

        c.stroke()
        c.globalCompositeOperation = 'source-over'
    }

    /**
     * Draws body positions
     * @private
     * @method bodyPositions
     * @param {Matter.Body[]} bodies
     * @param {CanvasRenderingContext2D} context
     */
    bodyPositions(bodies, context) {
        let c = context
        let engine = this.ctx.engine
        let options = this.ctx.options
        let body
        let part
        let i
        let k

        c.beginPath()

        // render current positions
        for (i = 0; i < bodies.length; i++) {
            body = bodies[i]

            if (!body.render.visible)
                continue

            // handle compound parts
            for (k = 0; k < body.parts.length; k++) {
                part = body.parts[k]
                c.arc(part.position.x, part.position.y, 3, 0, 2 * Math.PI, false)
                c.closePath()
            }
        }

        if (options.wireframes)
        { c.fillStyle = 'indianred' }
        else { c.fillStyle = 'rgba(0,0,0,0.5)' }

        c.fill()
        c.beginPath()

        // render previous positions
        for (i = 0; i < bodies.length; i++) {
            body = bodies[i];
            if (body.render.visible) {
                c.arc(
                    // @ts-ignore
                    body.positionPrev.x,
                    // @ts-ignore
                    body.positionPrev.y,
                    2, 0, 2 * Math.PI, false)
                c.closePath()
            }
        }

        c.fillStyle = 'rgba(255,165,0,0.8)'
        c.fill()
    }

    /**
     * Draws body velocity
     * @private
     * @method bodyVelocity
     * @param {Matter.Body[]} bodies
     * @param {CanvasRenderingContext2D} context
     */
    bodyVelocity(bodies, context) {
        let c = context
        c.beginPath()

        for (let i = 0; i < bodies.length; i++) {
            let body = bodies[i]

            if (!body.render.visible)
                continue

            c.moveTo(body.position.x, body.position.y)
            c.lineTo(
                // @ts-ignore
                body.position.x + (body.position.x - body.positionPrev.x) * 2,
                // @ts-ignore
                body.position.y + (body.position.y - body.positionPrev.y) * 2)
        }

        c.lineWidth = 3
        c.strokeStyle = 'cornflowerblue'
        c.stroke()
    }

    /**
     * Draws body ids
     * @private
     * @method bodyIds
     * @param {Matter.Body[]} bodies
     * @param {CanvasRenderingContext2D} context
     */
    bodyIds(bodies, context) {
        let c = context
        let i
        let j

        for (i = 0; i < bodies.length; i++) {
            if (!bodies[i].render.visible)
                continue

            let parts = bodies[i].parts;
            for (j = parts.length > 1 ? 1 : 0; j < parts.length; j++) {
                let part = parts[j]
                c.font = "12px Arial"
                c.fillStyle = 'rgba(255,255,255,0.5)'
                // @ts-ignore
                c.fillText(part.id, part.position.x + 10, part.position.y - 10)
            }
        }
    }

    /**
     * Description
     * @private
     * @method collisions
     * @param {pair[]} pairs
     * @param {CanvasRenderingContext2D} context
     */
    collisions(pairs, context) {
        let c = context
        let options = this.ctx.options
        let pair
        let collision
        let corrected
        let bodyA
        let bodyB
        let i
        let j

        c.beginPath()

        // render collision positions
        for (i = 0; i < pairs.length; i++) {
            pair = pairs[i]

            if (!pair.isActive)
                continue

            collision = pair.collision
            for (j = 0; j < pair.activeContacts.length; j++) {
                let contact = pair.activeContacts[j]
                let vertex = contact.vertex
                c.rect(vertex.x - 1.5, vertex.y - 1.5, 3.5, 3.5)
            }
        }

        if (options.wireframes)
        { c.fillStyle = 'rgba(255,255,255,0.7)' }
        else { c.fillStyle = 'orange' }
        c.fill()

        c.beginPath()

        // render collision normals
        for (i = 0; i < pairs.length; i++) {
            pair = pairs[i]

            if (!pair.isActive)
                continue

            collision = pair.collision

            if (pair.activeContacts.length > 0) {
                let normalPosX = pair.activeContacts[0].vertex.x
                let normalPosY = pair.activeContacts[0].vertex.y

                if (pair.activeContacts.length === 2) {
                    normalPosX = (pair.activeContacts[0].vertex.x + pair.activeContacts[1].vertex.x) / 2
                    normalPosY = (pair.activeContacts[0].vertex.y + pair.activeContacts[1].vertex.y) / 2
                }

                if (collision.bodyB === collision.supports[0].body || collision.bodyA.isStatic === true)
                { c.moveTo(normalPosX - collision.normal.x * 8, normalPosY - collision.normal.y * 8) }
                else { c.moveTo(normalPosX + collision.normal.x * 8, normalPosY + collision.normal.y * 8) }

                c.lineTo(normalPosX, normalPosY)
            }
        }

        if (options.wireframes)
        { c.strokeStyle = 'rgba(255,165,0,0.7)' }
        else { c.strokeStyle = 'orange' }

        c.lineWidth = 1
        c.stroke()
    }

    /**
     * Description
     * @private
     * @method separations
     * @param {pair[]} pairs
     * @param {CanvasRenderingContext2D} context
     */
    separations(pairs, context) {
        let c = context
        let options = this.ctx.options
        let pair
        let collision
        let corrected
        let bodyA
        let bodyB
        let i
        let j

        c.beginPath()

        // render separations
        for (i = 0; i < pairs.length; i++) {
            pair = pairs[i]

            if (!pair.isActive)
                continue

            collision = pair.collision
            bodyA = collision.bodyA
            bodyB = collision.bodyB

            let k = 1

            if (!bodyB.isStatic && !bodyA.isStatic) k = 0.5
            if (bodyB.isStatic) k = 0

            c.moveTo(bodyB.position.x, bodyB.position.y)
            c.lineTo(bodyB.position.x - collision.penetration.x * k, bodyB.position.y - collision.penetration.y * k)

            k = 1

            if (!bodyB.isStatic && !bodyA.isStatic) k = 0.5
            if (bodyA.isStatic) k = 0

            c.moveTo(bodyA.position.x, bodyA.position.y)
            c.lineTo(bodyA.position.x + collision.penetration.x * k, bodyA.position.y + collision.penetration.y * k)
        }

        if (options.wireframes)
        { c.strokeStyle = 'rgba(255,165,0,0.5)' }
        else { c.strokeStyle = 'orange' }
        c.stroke()
    }

    /**
     * Description
     * @private
     * @method grid
     * @param {Matter.Grid} grid
     * @param {CanvasRenderingContext2D} context
     */
    grid(grid, context) {
        let c = context
        let options = this.ctx.options

        if (options.wireframes)
        { c.strokeStyle = 'rgba(255,180,0,0.1)' }
        else { c.strokeStyle = 'rgba(255,180,0,0.5)' }

        c.beginPath()

        // @ts-ignore
        let bucketKeys = Matter.Common.keys(grid.buckets)

        for (let i = 0; i < bucketKeys.length; i++) {
            let bucketId = bucketKeys[i]

            // @ts-ignore
            if (grid.buckets[bucketId].length < 2)
                continue

            let region = bucketId.split(/C|R/)
            c.rect(
                0.5 + parseInt(region[1], 10) * grid.bucketWidth,
                0.5 + parseInt(region[2], 10) * grid.bucketHeight,
                grid.bucketWidth,
                grid.bucketHeight)
        }

        c.lineWidth = 1
        c.stroke()
    }

    // /**
    //  * Description
    //  * @private
    //  * @method inspector
    //  * @param {any} inspector
    //  * @param {CanvasRenderingContext2D} context
    //  */
    // inspector(inspector, context) {
    //     let engine = inspector.engine
    //     let selected = inspector.selected
    //     let render = inspector.render
    //     let options = render.options
    //     let bounds

    //     if (options.hasBounds) {
    //         let boundsWidth = render.bounds.max.x - render.bounds.min.x
    //         let boundsHeight = render.bounds.max.y - render.bounds.min.y
    //         let boundsScaleX = boundsWidth / render.options.width
    //         let boundsScaleY = boundsHeight / render.options.height

    //         context.scale(1 / boundsScaleX, 1 / boundsScaleY)
    //         context.translate(-render.bounds.min.x, -render.bounds.min.y)
    //     }

    //     for (let i = 0; i < selected.length; i++) {
    //         let item = selected[i].data

    //         context.translate(0.5, 0.5)
    //         context.lineWidth = 1
    //         context.strokeStyle = 'rgba(255,165,0,0.9)'
    //         context.setLineDash([1,2])

    //         switch (item.type) {
    //         case 'body':
    //             // render body selections
    //             bounds = item.bounds
    //             context.beginPath()
    //             context.rect(
    //                 Math.floor(bounds.min.x - 3),
    //                 Math.floor(bounds.min.y - 3),
    //                 Math.floor(bounds.max.x - bounds.min.x + 6),
    //                 Math.floor(bounds.max.y - bounds.min.y + 6))
    //             context.closePath()
    //             context.stroke()
    //             break

    //         case 'constraint':
    //             // render constraint selections
    //             let point = item.pointA
    //             if (item.bodyA) point = item.pointB
    //             context.beginPath()
    //             context.arc(point.x, point.y, 10, 0, 2 * Math.PI)
    //             context.closePath()
    //             context.stroke()
    //             break
    //         }

    //         context.setLineDash([])
    //         context.translate(-0.5, -0.5)
    //     }

    //     // render selection region
    //     if (inspector.selectStart !== null) {
    //         context.translate(0.5, 0.5)
    //         context.lineWidth = 1
    //         context.strokeStyle = 'rgba(255,165,0,0.6)'
    //         context.fillStyle = 'rgba(255,165,0,0.1)'
    //         bounds = inspector.selectBounds
    //         context.beginPath()
    //         context.rect(
    //             Math.floor(bounds.min.x),
    //             Math.floor(bounds.min.y),
    //             Math.floor(bounds.max.x - bounds.min.x),
    //             Math.floor(bounds.max.y - bounds.min.y))
    //         context.closePath()
    //         context.stroke()
    //         context.fill()
    //         context.translate(-0.5, -0.5)
    //     }

    //     if (options.hasBounds)
    //         context.setTransform(1, 0, 0, 1, 0, 0)
    // }

    /**
     * Updates render timing.
     * @method _updateTiming
     * @private
     * @param {number} time
     */
    _updateTiming(time) {
        let engine      = this.ctx.engine
        let timing      = this.ctx.timing
        let historySize = timing.historySize
        let timestamp   = engine.timing.timestamp

        timing.delta = time - timing.lastTime || Renderer._goodDelta
        timing.lastTime = time

        timing.timestampElapsed = timestamp - timing.lastTimestamp || 0
        timing.lastTimestamp = timestamp

        timing.deltaHistory.unshift(timing.delta)
        timing.deltaHistory.length = Math.min(timing.deltaHistory.length, historySize)

        timing.engineDeltaHistory.unshift(engine.timing.lastDelta)
        timing.engineDeltaHistory.length = Math.min(timing.engineDeltaHistory.length, historySize)

        timing.timestampElapsedHistory.unshift(timing.timestampElapsed)
        timing.timestampElapsedHistory.length = Math.min(timing.timestampElapsedHistory.length, historySize)

        timing.engineElapsedHistory.unshift(engine.timing.lastElapsed)
        timing.engineElapsedHistory.length = Math.min(timing.engineElapsedHistory.length, historySize)

        timing.elapsedHistory.unshift(timing.lastElapsed)
        timing.elapsedHistory.length = Math.min(timing.elapsedHistory.length, historySize)
    }

    /**
     * Returns the mean value of the given numbers.
     * @method _mean
     * @private
     * @param {Number[]} values
     * @return {Number} the mean of given values
     */
    _mean(values) {
        let result = 0;
        for (let i = 0; i < values.length; i += 1)
        { result += values[i] }
        return (result / values.length) || 0
    }

    /**
     * @method _createCanvas
     * @private
     * @param {number} width
     * @param {number} height
     * @return {HTMLCanvasElement}
     */
    _createCanvas(width, height) {
        let canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.oncontextmenu = () => { return false }
        canvas.onselectstart = () => { return false }
        return canvas;
    }

    /**
     * Gets the pixel ratio of the canvas.
     * @method _getPixelRatio
     * @private
     * @param {HTMLCanvasElement} canvas
     * @return {Number} pixel ratio
     */
    _getPixelRatio(canvas) {
        let context = canvas.getContext('2d')
        let devicePixelRatio = window.devicePixelRatio || 1
        let backingStorePixelRatio =
            // @ts-ignore
            context.webkitBackingStorePixelRatio ||
            // @ts-ignore
            context.mozBackingStorePixelRatio ||
            // @ts-ignore
            context.msBackingStorePixelRatio ||
            // @ts-ignore
            context.oBackingStorePixelRatio ||
            // @ts-ignore
            context.backingStorePixelRatio || 1

        return devicePixelRatio / backingStorePixelRatio
    }

    /**
     * Gets the requested texture (an Image) via its path
     * @method _getTexture
     * @private
     * @param {string} imagePath
     * @return {image} texture
     */
    _getTexture(imagePath) {
        let image = this.ctx.textures[imagePath]
        if (image) return image

        image = this.ctx.textures[imagePath] = new Image()
        image.src = imagePath

        return image
    }

    /**
     * Applies the background to the canvas using CSS.
     * @method applyBackground
     * @private
     * @param {string} background
     */
    _applyBackground(background) {
        let cssBackground = background

        if (/(jpg|gif|png)$/.test(background))
            cssBackground = 'url(' + background + ')'

        this.ctx.canvas.style.background = cssBackground
        this.ctx.canvas.style.backgroundSize = "contain"
        this.ctx.currentBackground = background
    }
}
