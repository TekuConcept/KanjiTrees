
// import $             from './jquery.mjs'
import Matter        from './matter.mjs'
import Matrix        from './Matrix.mjs'
import Relation      from './Relation.mjs'
import Renderer      from './Renderer.mjs'
import TreeStructure from './TreeStructure.mjs'

const MOUSE_LEFT   = 0
const MOUSE_MIDDLE = 1
const MOUSE_RIGHT  = 2

const LEFT_BUTTON  = 0
const RIGHT_BUTTON = 1

let setImmediate   = window.setImmediate   || ((/** @type {() => void} */ cb) => setTimeout(cb, 1))
let clearImmediate = window.clearImmediate || ((/** @type {number} */id) => clearTimeout(id))

/**
 * @param {number} min
 * @param {number} max
 */
function randomIntWithin(min, max) { return Math.floor(Math.random() * (max - min + 1) + min) }

/**
 * @param {number} min 
 * @param {number} max 
 * @returns {number}
 */
function randomWithin(min, max) { return Math.random() * (max - min + 1) + min }

/**
 * @param {Array<{kanji:string}>} arr 
 * @param {string} val 
 * @returns {number} index
 */
function binarySearch(arr, val) {
    let start = 0;
    let end = arr.length - 1;
    while (start <= end) {
        let mid = Math.floor((start + end) / 2);
        if (arr[mid].kanji === val)
            return mid;
        if (val < arr[mid].kanji)
            end = mid - 1;
        else start = mid + 1;
    }
    return -1;
}

/* global context */
let context = {
    engine: undefined,
    renderer: undefined,
    eventloop: undefined,
    mouseConstraint: undefined,

    treeRoot: undefined,
    treeBox: {x:0,y:0,width:1,height:1},

    page: {
        label: undefined,
        onyomi: undefined,
        kunyomi: undefined,
        strokes: undefined,
        glyphclass: undefined,
        mnemonic: {
            row: undefined,
            cell: undefined
        },
        jisho: {
            row: undefined,
            link: undefined
        },

        menu: undefined,
        search: undefined,
        number: undefined,
        list: undefined,
    },

    params: {
        symbol: '木',
        mode: 'rtk',
        count: 0,
        list: []
    },
    asyncListBuilderId: undefined, // NodeJS.Immediate()

    isMouseDown: false,
    mouseinfo: {
        start: {x:0,y:0},
        delta: {x:0,y:0},
        offset: {x:0,y:0},
        scale: {x:1,y:1}
    },

    dictionary: [],
    lists: {
        rtk: [],
        jlpt: {
            '1': [],
            '2': [],
            '3': [],
            '4': [],
            '5': []
        },
        pure: []
    }
}

// ----------------------------------------------------------------------------

function getTreeBoundingRect(root) {
    let rect = {x:0,y:0,width:1,height:1}
    if (!root) return rect
    let x1 = root.pos.x
    let y1 = root.pos.y
    let x2 = root.pos.x
    let y2 = root.pos.y
    function scan(node) {
        node.children.forEach(child => scan(child))
        if (node.pos.x < x1)
            x1 = node.pos.x
        else if (node.pos.x > x2)
            x2 = node.pos.x
        if (node.pos.y < y1)
            y1 = node.pos.y
        else if (node.pos.y > y2)
            y2 = node.pos.y
    }
    scan(root)
    rect.x = x1
    rect.y = y1
    rect.width = (x2 - x1) || rect.width
    rect.height = (y2 - y1) || rect.height
    return rect
}

/**
 * @param {{
 *      name: string;
 *      children: any[];
 *      skip: boolean;
 *      msgopacity: number;
 *      mesh:any;
 *      sensor:any;
 *      constraint:any;
 *      relation: any;
 *      pos: { x: number; y: number; };
 *      __meta: any;
 * }} root
 */
function CreateTreeNodeMesh(root) {
    let stack = []
    stack.push(root)

    let infoPanel  = $('#info-panel')
    let canvas     = $($('canvas')[0])
    let viewWidth  = canvas.width() - infoPanel.outerWidth(true)
    let viewHeight = canvas.height()
    let yOffset    = viewHeight * 0.20
    let xOffset    = viewWidth / 2 + infoPanel.outerWidth(true)
    let scale      = viewHeight * 0.15
    let radius     = viewHeight * 0.05
    let fontsize   = radius * 0.8
    const SPRITE_SiZE = 100 / 2

    while (stack.length > 0) {
        let node = stack[stack.length - 1]
        stack.pop()
        if (node.skip) continue

        let x = node.pos.x * scale + xOffset
        let y = node.pos.y * scale + yOffset
        node.mesh = Matter.Bodies.circle(x, y, radius, {
            render: {
                sprite: {
                    xScale: radius / SPRITE_SiZE,
                    yScale: radius / SPRITE_SiZE,
                    texture: './img/tree-node.png'
                },
                text: {
                    value: node.name,
                    fontsize: fontsize,
                    fontfamily: '"Yuji Boku",sans-serif',
                    color: 'black',
                    textalign: 'center'
                }
            }
        })
        node.msgopacity = 0
        node.constraint = Matter.Constraint.create({
            pointA: { x: x, y: y },
            bodyB: node.mesh,
            pointB: { x: 0, y: 0 },
            stiffness: 0.001,
            render: { visible: false }
        })
        Matter.Composite.add(context.engine.world, [ node.mesh, node.constraint ])
        node.mesh.position.x += randomWithin(0, 2)
        node.mesh.position.y += randomWithin(0, 2)

        if (node.__meta.parent) {
            node.relation = new Relation({
                bodyA: node.__meta.parent.mesh,
                pointA: { x: 0, y: radius * 0.5 },
                bodyB: node.mesh,
                pointB: { x: 0, y: -radius },
                render: { strokeStyle: 'rgba(82, 82, 82, 255)' }
            })
            Matter.Composite.add(context.engine.world, node.relation)
        }

        node.children.forEach(child => {
            stack.push(child)
        })
    }
}

function loadTree() {
    context.treeRoot = {
        name: '12',
        skip: false,
        children: [
            {
                name: '7',
                skip: false,
                children: [
                    {
                        name: '2',
                        skip: false,
                        children: [
                            {
                                name: '1',
                                skip: false,
                                children: [
                                    {
                                        name: '0',
                                        skip: false,
                                        children: [],
                                        pos: {x:0,y:0}
                                    }
                                ],
                                pos: {x:0,y:0}
                            }
                        ],
                        pos: {x:0,y:0}
                    },
                    {
                        name: '6',
                        skip: false,
                        children: [
                            {
                                name: '4',
                                skip: false,
                                children: [
                                    {
                                        name: '3',
                                        skip: false,
                                        children: [],
                                        pos: {x:0,y:0}
                                    }
                                ],
                                pos: {x:0,y:0}
                            },
                            {
                                name: '5',
                                skip: false,
                                children: [],
                                pos: {x:0,y:0}
                            }
                        ],
                        pos: {x:0,y:0}
                    },
                    // {
                    //     name: 'A',
                    //     skip: false,
                    //     children: [
                    //         {
                    //             name: 'B',
                    //             skip: false,
                    //             children: [],
                    //             pos: {x:0,y:0}
                    //         },
                    //         {
                    //             name: 'C',
                    //             skip: false,
                    //             children: [],
                    //             pos: {x:0,y:0}
                    //         }
                    //     ],
                    //     pos: {x:0,y:0}
                    // }
                ],
                pos: {x:0,y:0}
            },
            {
                name: '11',
                skip: false,
                children: [
                    {
                        name: '8',
                        skip: false,
                        children: [],
                        pos: {x:0,y:0}
                    },
                    {
                        name: '10',
                        skip: false,
                        children: [
                            {
                                name: '9',
                                skip: false,
                                children: [],
                                pos: {x:0,y:0}
                            }
                        ],
                        pos: {x:0,y:0}
                    }
                ],
                pos: {x:0,y:0}
            }
        ],
        pos: {x:0,y:0}
    }
    TreeStructure.arrange(context.treeRoot, { x: 0, y: 0 })
    context.treeBox = getTreeBoundingRect(context.treeRoot)
    CreateTreeNodeMesh(context.treeRoot)
}

function exampleTree() {
    context.treeRoot = {
        name: 'O',
        children: [
            {
                name: 'E',
                children: [
                    {
                        name: 'A',
                        children: [],
                        pos: {x:0,y:0}
                    },
                    {
                        name: 'D',
                        children: [
                            {
                                name: 'B',
                                children: [],
                                pos: {x:0,y:0}
                            },
                            {
                                name: 'C',
                                children: [],
                                pos: {x:0,y:0}
                            }
                        ],
                        pos: {x:0,y:0}
                    }
                ],
                pos: {x:0,y:0}
            },
            {
                name: 'F',
                children: [
                    // {
                    //     name: 'X',
                    //     children: [],
                    //     pos:{x:0,y:0}
                    // }
                ],
                pos: {x:0,y:0}
            },
            {
                name: 'N',
                children: [
                    {
                        name: 'G',
                        children: [
                            {
                                name: 'H',
                                children: [],
                                pos: {x:0,y:0}
                            },
                            {
                                name: 'I',
                                children: [],
                                pos: {x:0,y:0}
                            },
                            {
                                name: 'J',
                                children: [],
                                pos: {x:0,y:0}
                            },
                            {
                                name: 'K',
                                children: [],
                                pos: {x:0,y:0}
                            },
                            {
                                name: 'L',
                                children: [],
                                pos: {x:0,y:0}
                            }
                        ],
                        pos: {x:0,y:0}
                    },
                    {
                        name: 'M',
                        children: [],
                        pos: {x:0,y:0}
                    }
                ],
                pos: {x:0,y:0}
            }
        ],
        pos: {x:0,y:0}
    }
    TreeStructure.arrange(context.treeRoot, {x:10,y:0})
    CreateTreeNodeMesh(context.treeRoot)
}

/**
 * @param {string} kanji 
 */
function buildTree(kanji) {
    let index = binarySearch(context.dictionary, kanji)
    if (index < 0) {
        context.treeRoot = undefined
        return
    }

    let dict = context.dictionary
    context.treeRoot = {
        name: dict[index].kanji,
        meaning: dict[index].definitions.join(', '),

        children: [],
        pos: {x:0,y:0},

        parts: dict[index].parts
    }

    let stack = []
    stack.push(context.treeRoot)

    while (stack.length > 0) {
        let node = stack[stack.length - 1]
        stack.pop()
        if (node.skip) continue

        node.parts.forEach(part => {
            index = binarySearch(context.dictionary, part)
            if (index < 0) return

            let child = {
                name: dict[index].kanji,
                meaning: dict[index].definitions.join(', '),

                children: [],
                pos: {x:0,y:0},

                parts: dict[index].parts
            }

            node.children.push(child)
            stack.push(child)
        })

        delete node.parts
    }
    
    TreeStructure.arrange(context.treeRoot, { x: 0, y: 0 })
    context.treeBox = getTreeBoundingRect(context.treeRoot)
    CreateTreeNodeMesh(context.treeRoot)
}

function destroyTree() {
    if (!context.treeRoot) return
    function loop(node) {
        node.children.forEach(child => loop(child))
        Matter.Composite.remove(context.engine.world, node.relation)

        delete node.name
        delete node.meaning

        delete node.pos.x
        delete node.pos.y
        delete node.pos

        node.children.length = 0
        delete node.children

        delete node.msgopacity

        Matter.Composite.remove(context.engine.world, [ node.mesh, node.constraint ])
        delete node.mesh
        delete node.constraint

        if (node.relation) {
            let relation = node.relation
            Matter.Composite.remove(context.engine.world, relation)
            delete node.relation
        }
    }
    loop(context.treeRoot)
    context.treeRoot = undefined
}

/**
 * @param {string} kanji 
 */
function generateNextTree(kanji) {
    if (!kanji) return
    destroyTree()
    buildTree(kanji)
    updateKanjiInfo()
}

// ----------------------------------------------------------------------------

/**
 * @param {{x:number;y:number}} translation
 * @param {{x:number;y:number}} scale
 */
function updateTransform(translation, scale) {
    let center = {
        width: context.renderer.ctx.canvas.width / 2,
        height: context.renderer.ctx.canvas.height / 2
    }
    let transform = Matrix.createTranslation(center.width, center.height)
    .mul(Matrix.createScale(scale.x, scale.y))
    .mul(Matrix.createTranslation(
        translation.x - center.width,
        translation.y - center.height))
    context.renderer.ctx.context.setTransform(
        transform.data[0], 0, 0,
        transform.data[4], transform.data[2], transform.data[5]
    )
    Matter.Mouse.setTransform(context.mouseConstraint.mouse, transform)
}

/**
 * @param {{mouse:Matter.Mouse;source:any;name:string}} event
 */
function handleMouseDown(event) {
    if (event.mouse.button == MOUSE_MIDDLE || event.mouse.keys.ctrl) {
        context.mouseinfo.start.x = event.mouse.absolute.x
        context.mouseinfo.start.y = event.mouse.absolute.y
        context.isMouseDown = true
    }
}
/**
 * @param {{mouse:Matter.Mouse;source:any;name:string}} event
 */
function handleMouseMove(event) {
    if (!context.isMouseDown) return

    context.mouseinfo.delta.x = context.mouseinfo.offset.x +
        (event.mouse.absolute.x - context.mouseinfo.start.x)
    context.mouseinfo.delta.y = context.mouseinfo.offset.y +
        (event.mouse.absolute.y - context.mouseinfo.start.y)
    updateTransform(context.mouseinfo.delta, context.mouseinfo.scale)
}
/**
 * @param {{mouse:Matter.Mouse;source:any;name:string}} event
 */
function handleMouseUp(event) {
    if (context.isMouseDown) {
        context.mouseinfo.offset.x += (event.mouse.absolute.x - context.mouseinfo.start.x)
        context.mouseinfo.offset.y += (event.mouse.absolute.y - context.mouseinfo.start.y)
        updateTransform(context.mouseinfo.offset, context.mouseinfo.scale)
        context.isMouseDown = false
    }
}
/**
 * @param {{mouse:Matter.Mouse;source:any;name:string}} event
 */
function handleMouseWheel(event) {
    // do not zoom when scrolling within the info panel
    let ignorewidth = document.getElementById('info-panel').clientWidth
    if (event.mouse.absolute.x < ignorewidth) return

    let dw = event.mouse.wheelDelta * 0.1
    context.mouseinfo.scale.x += dw
    context.mouseinfo.scale.y += dw
    updateTransform(context.mouseinfo.offset, context.mouseinfo.scale)
}

/**
 * @param {number} button 
 */
function handleButtonClick(button) {
    let index = context.params.list.indexOf(context.params.symbol)

    // handle when list is empty or changed
    // user will either need to update their search,
    // change lists again, or manually select a symbol
    if (index < 0 && context.params.list.length === 0) return

    // get next index
    switch (button) {
    case LEFT_BUTTON:  index = (index < 0) ? 0 : index - 1; break
    case RIGHT_BUTTON: index = (index < 0) ? 0 : index + 1; break
    }

    // handle index wrapping
    if (index < 0) index = context.params.list.length - 1
    else if (index >= context.params.list.length)
        index = 0

    // update information and tree
    selectTree(context.params.list[index])
}

/**
 * @param {string} symbol 
 */
function selectTree(symbol) {
    context.params.symbol = symbol
    Matter.Runner.stop(context.eventloop)
    context.renderer.stop()
    generateNextTree(context.params.symbol)
    context.renderer.resume()
    Matter.Runner.run(context.eventloop, context.engine)
}

/**
 * @param {JQuery} element 
 * @param {boolean} value 
 */
function showElement(element, value) {
    if (value) {
        element.removeClass('hide')
        element.addClass('show')
    }
    else {
        element.removeClass('show')
        element.addClass('hide')
    }
}

/**
 * @param {string} mode 
 */
function handleModeChange(mode) {
    context.params.mode = mode
    switch (mode) {
    case 'jlpt1':
        context.params.list = context.lists['jlpt']['1']
        context.page.menu.text('JLPT - N1')
        break;
    case 'jlpt2':
        context.params.list = context.lists['jlpt']['2']
        context.page.menu.text('JLPT - N2')
        break;
    case 'jlpt3':
        context.params.list = context.lists['jlpt']['3']
        context.page.menu.text('JLPT - N3')
        break;
    case 'jlpt4':
        context.params.list = context.lists['jlpt']['4']
        context.page.menu.text('JLPT - N4')
        break;
    case 'jlpt5':
        context.params.list = context.lists['jlpt']['5']
        context.page.menu.text('JLPT - N5')
        break;
    case 'pure':
        context.params.list = context.lists['pure']
        context.page.menu.text('Pure Japanese Glyphs')
        break;
    case 'search-definitions':
        context.params.list = []
        context.page.menu.text('Definition Search')
        break;
    case 'search-radicals':
        context.params.list = []
        context.page.menu.text('Radical Search')
        break;
    case 'search-strokes':
        context.params.list = []
        context.page.menu.text('Stroke-Count Search')
        break;
    case 'random':
        context.params.list = []
        context.page.menu.text('Random')
        break;
    case 'rtk':
    default:
        context.params.list = context.lists.rtk
        context.page.menu.text('Remember the Kanji')
        break;
    }

    let isSearchable =
        (mode === 'search-radicals') ||
        (mode === 'search-definitions')
    let isNumberable =
        (mode === 'random') ||
        (mode === 'search-strokes')

    showElement(context.page.search, isSearchable)
    showElement(context.page.number, isNumberable)
    generateList(undefined)
}

/**
 * Number of random glyphs to select
 * @param {string|number} value 
 */
function updateRandomCount(value) {
    let count = 10
    if (typeof value === 'string')
    { try { count = parseInt(value) } catch { } }
    else count = value
    context.params.count = count || 10
}

/**
 * @param {string} searchterm 
 * @param {number} type
 * @returns {Array<string>}
 */
function searchAndCollectSymbols(searchterm, type) {
    let result = []
    context.dictionary.forEach(entry => {
        if (entry.rad) return // don't include radicals in the search
        if (type === 0 /* stroke search */) {
            if (entry.strokes === searchterm)
                result.push(entry.kanji)
        }
        else if (type === 1 /* definition search */) {
            searchterm = searchterm.toLowerCase()
            for (let i = 0; i < entry.definitions.length; i++) {
                if (entry.definitions[i].includes(searchterm)) {
                    result.push(entry.kanji)
                    break
                }
            }
        }
        else /* radical search */ {
            for (let i = 0; i < entry.parts.length; i++) {
                if (searchterm.includes(entry.parts[i])) {
                    result.push(entry.kanji)
                    break
                }
            }
        }
    })
    return result
}

/**
 * @param {string|number} value 
 */
function generateList(value) {
    if (value) {
        switch (context.params.mode) {
        case 'random': {
            // generate new random list
            context.params.list = []
            updateRandomCount(value)
            let set = new Set()
            // select without replacement
            while (set.size < context.params.count) {
                // Note: using dictionary.length but count of symbols
                // that aren't radicals will be less than this
                let index = randomIntWithin(0, context.dictionary.length)
                // ignore radicals
                if (context.dictionary[index].rad) continue
                set.add(index)
            }
            set.forEach(index => context.params.list.push(context.dictionary[index].kanji))
        } break;

        case 'search-strokes': {
            // search for strokes
            console.log('> ',value)
            let v = (typeof value === 'number') ? value.toString() : value
            context.params.list = searchAndCollectSymbols(v, 0)
        } break;

        case 'search-definitions':
            // search for definitions
            context.params.list = searchAndCollectSymbols(value.toString(), 1)
            break;

        case 'search-radicals':
            // search for radicals
            context.params.list = searchAndCollectSymbols(value.toString(), 2)
            break;

        default: /* display given list as is */ break;
        }
    }

    // cancel current async builder if any
    clearImmediate(context.asyncListBuilderId)

    context.page.list.empty()
    /**
     * @param {number} index
     */
    function asyncListBuilder(index) {
        // escape if we've reached the end of the list
        if (index >= context.params.list.length) return
        // create and add new element
        let next = Math.min(context.params.list.length, index + 10)
        for (let i = index; i < next; i++) {
            let item = context.params.list[i]
            let element = document.createElement('a')
            element.text = item
            element.href = 'javascript:void(0)'
            element.onclick = () => selectTree(item)
            context.page.list.append(element)
        }
        // schedule next iteration
        context.asyncListBuilderId = setImmediate(() => asyncListBuilder(next))
    }
    context.asyncListBuilderId = setImmediate(() => asyncListBuilder(0))
}

function updateKanjiInfo() {
    if (!context.treeRoot) return

    let index = binarySearch(context.dictionary, context.treeRoot.name)
    let dict = context.dictionary
    context.page.label.text(dict[index].kanji)
    context.page.strokes.text(dict[index].strokes.toString())

    if (dict[index].on_yomi)
        context.page.onyomi.text(dict[index].on_yomi)
    else context.page.onyomi.text('- -')

    if (dict[index].kun_yomi)
        context.page.kunyomi.text(dict[index].kun_yomi)
    else context.page.kunyomi.text('- -')

    let glyphInfo = `<b>${dict[index].class || 'unknown'}</b>`
    if (dict[index].notes) glyphInfo += `: ${dict[index].notes}`
    context.page.glyphclass.html(glyphInfo)

    if (!!dict[index].mnemonic)
        context.page.mnemonic.row.removeClass('hide')
    else context.page.mnemonic.row.addClass('hide')
    if (dict[index].mnemonic)
    { context.page.mnemonic.cell.html(`Mnemonic<br><i>${dict[index].mnemonic}</i>`) }

    let jishourl = `https://jisho.org/search/*${encodeURIComponent(dict[index].kanji)}*`
    context.page.jisho.link.attr('href', jishourl)

    // update the hash for reference and page-refreshing
    let hash = context.treeRoot.name
    if (context.params.mode !== 'rtk')
        hash += `&mode=${context.params.mode}`
    hash = encodeURIComponent(hash)
    if (history.pushState)
        window.history.pushState(null, null, `#${hash}`)
    else window.location.hash = hash
}

// ----------------------------------------------------------------------------

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} str
 * @param {{x:number;y:number}} point
 * @param {number} maxwidth
 */
function drawMultilineText(ctx, str, point, maxwidth) {
    let sizeofsymbol = ctx.measureText('木')
    let maxchars = Math.round(maxwidth / sizeofsymbol.width)
    if (maxchars === 0) return

    // str = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'
    let words = str.replace(/[\s\n\r]+/g, ' ').split(' ').filter(w => w)

    let lines = []
    let nextline = ''
    words.forEach(word => {
        if (nextline.length + word.length + 1 > maxchars) {
            lines.push(nextline)
            nextline = word
        }
        else nextline += ` ${word}`
    })
    lines.push(nextline)

    let height = sizeofsymbol.width * 1.1
    for (let i = 0; i < lines.length; i++)
    { ctx.fillText(lines[i], point.x, point.y + i * height) }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 */
function drawMessage(ctx) {
    if (!context.treeRoot) return
    const FADE_RATE = 0.0005
    let stack = []
    stack.push(context.treeRoot)

    let maxwidth = context.renderer.ctx.canvas.width * 0.4
    let radius = context.treeRoot.mesh.circleRadius || 0
    let diameter = radius * 2

    let bodyStyle = window.getComputedStyle(document.body)
    ctx.font = `${radius * 0.5}px ${bodyStyle.fontFamily}`
    ctx.textAlign = 'center'

    while (stack.length > 0) {
        let node = stack[stack.length - 1]
        stack.pop()
        if (node.skip) continue
        node.children.forEach(child => stack.push(child))

        let point = {
            x: node.constraint.pointA.x,
            y: node.constraint.pointA.y + radius
        }
        let meshpoint = node.mesh.position

        // perform our own sensor-collision detection
        // because MatterJS sensors don't always fire
        // downside is we have to do this every frame
        let distance = Math.sqrt(
            Math.pow(point.x - meshpoint.x, 2) +
            Math.pow(point.y - meshpoint.y, 2))
        
        // update text opacity
        if (distance > diameter) {
            if (node.msgopacity < 1)
                node.msgopacity = Math.min(node.msgopacity + FADE_RATE, 1)
        }
        else if (node.msgopacity > 0) {
            node.msgopacity = Math.max(node.msgopacity - FADE_RATE, 0)
        }
        if (node.msgopacity <= 0) continue

        // draw text to screen
        ctx.fillStyle = `rgba(28, 54, 102, ${255 * node.msgopacity})`
        drawMultilineText(ctx, node.meaning, point, maxwidth)
    }
}

// ----------------------------------------------------------------------------

async function loadData() {
    { // load kanji dictionary
        let res = await fetch('./kanji-data.json')
        if (res.status !== 200) return
        context.dictionary = await res.json()
        context.dictionary.sort((a, b) => (a.kanji > b.kanji) ? 1 : -1)
    }

    { // load kanji lists
        let res = await fetch('./kanji-lists.json')
        if (res.status !== 200) return
        context.lists = await res.json()
    }
}

function cachePageElements() {
    context.page.label      = $('#current-symbol-v')
    context.page.onyomi     = $('#onyomi')
    context.page.kunyomi    = $('#kunyomi')
    context.page.strokes    = $('#kanji-strokes')
    context.page.glyphclass = $('#glyph-class')

    context.page.mnemonic.row  = $('#mnemonic')
    context.page.mnemonic.cell = context.page.mnemonic.row.find('td')

    context.page.jisho.row  = $('#jisho')
    context.page.jisho.link = context.page.jisho.row.find('td').find('a')

    context.page.menu   = $('.mode-menu').find('button')
    context.page.search = $($('.search-container')[0])
    context.page.number = $($('.search-container')[1])
    context.page.list   = $('#symbol-list')
}

function createSimulationEnv() {
    context.engine    = Matter.Engine.create()
    context.eventloop = Matter.Runner.create()
    context.renderer  = new Renderer({
        element: document.body,
        engine: context.engine,
        options: {
            showAngleIndicator: false,
            wireframes: false
        }
    })
    let mouse = Matter.Mouse.create(context.renderer.canvas)
    context.mouseConstraint = Matter.MouseConstraint.create(
        context.engine, {
        mouse: mouse,
        constraint: {
            // @ts-ignore
            angularStiffness: 0,
            render: { visible: false }
        }
    })
    context.renderer.ctx.mouse = mouse
    Matter.Composite.add(context.engine.world, context.mouseConstraint)
}

function getHashParams() {
    let hash = window.location.toString().split(/[#?]/)[1]
    if (!hash) return { symbols: [ '木' ] }
    let parts = hash.split(/[&]/)
    let result = { symbols: [] }
    for (let i = 0; i < parts.length; i += 2) {
        let index = parts[i].indexOf('=')
        if (index > 0) {
            // ignoreing '=value'-like parts
            // 'name='-like parts will have zero-length strings
            let name = parts[i].slice(0, index)
            let value = parts[i].slice(index + 1) || ''
            result[decodeURIComponent(name)] = decodeURIComponent(value)
        }
        else result.symbols.push(decodeURIComponent(parts[i]))
    }
    return result;
}

function loadInitialParams() {
    let params = getHashParams()

    // TODO: fix issue with url-encoded symbols
    context.params.symbol = params.symbols[0]
    if (binarySearch(context.dictionary, context.params.symbol) < 0)
        context.params.symbol = '木'

    if (params['mode']) {
        switch (params['mode'].toLowerCase()) {
        case 'jlpt1': case 'jlpt-n1': handleModeChange('jlpt1'); break;
        case 'jlpt2': case 'jlpt-n2': handleModeChange('jlpt2'); break;
        case 'jlpt3': case 'jlpt-n3': handleModeChange('jlpt3'); break;
        case 'jlpt4': case 'jlpt-n4': handleModeChange('jlpt4'); break;
        case 'jlpt5': case 'jlpt-n5': handleModeChange('jlpt5'); break;
        case 'pure':  case 'pure-jp': handleModeChange('pure');  break;
        case 'search-def': case 'search-definitions':
            handleModeChange('search-def'); break;
        case 'search-rad': case 'search-radicals':
            handleModeChange('search-rad'); break;
        case 'search-strokes': handleModeChange('search-strokes'); break;
        case 'rand': case 'random':
            let count = params['count'] || params['c'] || '10'
            try { context.params.count = parseInt(count) || 10 }
            catch { context.params.count = 20 }
            handleModeChange('random')
            break;
        case 'rtk': default: handleModeChange('rtk'); break;
        }
    }
    else handleModeChange('rtk')
}

function linkEventListeners() {
    Matter.Events.on(context.mouseConstraint, 'mousedown', handleMouseDown)
    Matter.Events.on(context.mouseConstraint, 'mousemove', handleMouseMove)
    Matter.Events.on(context.mouseConstraint, 'mouseup', handleMouseUp)
    Matter.Events.on(context.mouseConstraint, 'mousewheel', handleMouseWheel)

    context.renderer.on('resize', () => {
        context.mouseinfo.offset.x = 0
        context.mouseinfo.offset.y = 0
        Matter.Mouse.setOffset(context.mouseConstraint.mouse, context.mouseinfo.offset)
    })
    context.renderer.on('preDraw', drawMessage)
    // context.renderer.on('postDraw', (/** @type {CanvasRenderingContext2D} */ ctx) => {
    //     // draw mouse
    //     ctx.strokeStyle = '#000'
    //     ctx.lineWidth = 1
    //     let point = context.mouseConstraint.mouse.position
    //     ctx.beginPath()
    //     ctx.strokeRect(point.x - 5, point.y - 5, 10, 10)
    //     ctx.stroke()
    // })

    document.getElementById('left-arrow').onclick = () => handleButtonClick(LEFT_BUTTON)
    document.getElementById('right-arrow').onclick = () => handleButtonClick(RIGHT_BUTTON)

    document.getElementById('rtk').onclick = () => handleModeChange('rtk')
    document.getElementById('pur').onclick = () => handleModeChange('pure')
    document.getElementById('ran').onclick = () => handleModeChange('random')
    document.getElementById('jn5').onclick = () => handleModeChange('jlpt5')
    document.getElementById('jn4').onclick = () => handleModeChange('jlpt4')
    document.getElementById('jn3').onclick = () => handleModeChange('jlpt3')
    document.getElementById('jn2').onclick = () => handleModeChange('jlpt2')
    document.getElementById('jn1').onclick = () => handleModeChange('jlpt1')
    document.getElementById('def').onclick = () => handleModeChange('search-definitions')
    document.getElementById('rad').onclick = () => handleModeChange('search-radicals')
    document.getElementById('sto').onclick = () => handleModeChange('search-strokes')

    { // link search box
        let form = context.page.search.find('form')
        let button = form.find('button')
        let input = form.find('input')
        button.click(() => generateList(input.val()))
    }

    { // link number box
        let form = context.page.number.find('form')
        let button = form.find('button')
        let input = form.find('input')
        button.click(() => generateList(input.val()))
    }

    window.addEventListener('hashchange', () => {
        loadInitialParams()
        selectTree(context.params.symbol)
    })
}

function windowLoading() {
    return new Promise((resolve) => window.onload = () => resolve())
}

async function main() {
    console.log('-- BEGIN --')

    await windowLoading()
    await loadData()

    cachePageElements()
    createSimulationEnv()
    loadInitialParams()
    linkEventListeners()

    generateNextTree(context.params.symbol)

    context.renderer.run()
    Matter.Runner.run(context.eventloop, context.engine)

    console.log('-- END OF LINE --')
}

$(main)
