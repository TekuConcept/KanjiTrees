
import Matter from './matter.mjs'

export default class Relation {
    /**
     * @param {any} options
     */
    constructor(options) {
        // Matter.Common.extend({ 
        //     parent: null,
        //     isModified: false,
        //     bodyA: undefined,
        //     pointA: 
        //     bodyB: undefined,
        // }, options);

        this.ctx = options || {}
        this.bodyA = this.ctx.bodyA
        this.bodyB = this.ctx.bodyB
        this._pointA = this.ctx.pointA
        this._pointB = this.ctx.pointB

        // if bodies defined but no points, use body center
        if (this.bodyA && !this._pointA)
            this._pointA = {x:0,y:0}
        if (this.bodyB && !this._pointB)
            this._pointB = {x:0,y:0}

        // option defaults
        this.id = this.ctx.id || Matter.Common.nextId()
        this.label = this.ctx.label || 'Relation'
        this.type = 'relation'
        this.plugin = {}

        // render
        let render = {
            visible: true,
            lineWidth: 1,
            strokeStyle: '#ffffff',
            type: 'line'
        }

        this.render = Matter.Common.extend(render, this.ctx.render)
    }

    get pointA() {
        return this.bodyA ?
            Matter.Vector.add(this.bodyA.position, this._pointA) :
            this._pointA
    }

    get pointB() {
        return this.bodyB ?
            Matter.Vector.add(this.bodyB.position, this._pointB) :
            this._pointB
    }
}
