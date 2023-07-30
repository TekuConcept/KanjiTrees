/**
 * Reingold-Tilford-Walker Algorithm (quadratic time)
 * - J. Walker II. A node-positioning algorithm for general trees.
 *   Software – Practice and Experience, 20(7):685–705, 1990.
 */

export default class TreeStructure {
    /**
     * A fixed distance used in the final walk of the tree to determine the absolute
     * x-coordinate of a node with respect to the apex node of the tree.
     */
    static xTopAdjustment = 0

    /**
     * A fixed distance used in the final walk of the tree to determine the absolute
     * y-coordinate of a node with respect to the apex node of the tree.
     */
    static yTopAdjustment = 0

    /**
     * The maximum number of levels in the tree to be positioned. If all levels
     * are to be positioned, set this value to positive infinity (or an appropriate
     * numerical value)
     */
    static MaxDepth = 0x7FFFFFFF

    /**
     * The fixed distance between adjacent levels of the tree. Used in determining
     * the y-coordinate of a node being positioned
     */
    static LevelSeparation = 1.25

    /**
     * The minimum distance between adjacent siblings of the tree.
     */
    static SiblingSeparation = 1

    /**
     * The minimum distance between adjacent subtrees if a tree. For proper
     * aesthetics, this value is normally somewhat larger than SiblingSeparation.
     */
    static SubtreeSeparation = 1

    /**
     * The drawing-width of each node
     */
    static NodeSize = 0.25

    // ------------------------------------------------------------------------

    constructor() {}

    /**
     * @param {{ children: any[]; __meta?: { xcoord: number; ycoord: number; prelim: number } }} root
     * @param {{x:number;y:number}} [offset]
     * @returns {boolean}
     */
    static arrange(root, offset) {
        if (!root) return true

        /**
         * Initialize the list of nodes at each level
         */
        TreeStructure.__preprocess(root)

        /**
         * Do the preliminary positioning with a postorder walk
         */
        TreeStructure.__firstwalk(root, 0)

        /**
         * Determine how to adjust all the nodes with respect to
         * the location of the root
         */
        TreeStructure.xTopAdjustment = root.__meta.xcoord - root.__meta.prelim + offset.x
        TreeStructure.yTopAdjustment = root.__meta.ycoord + offset.y

        /**
         * Do the final positioning with a preorder walk
         */
        return TreeStructure.__secondwalk(root, 0, 0)
    }

    /**
     * Create a linking network of relations between all the nodes in the tree.
     * Also setup initial values for determining node {x,y} coordinates later.
     * @param {any} root
     */
    static __preprocess(root) {
        root.__meta = {
            parent:       undefined, /** The current node's hierarchical parent */
            firstchild:   undefined, /** The current node's leftmost offspring */
            leftsibling:  undefined, /** The current node's closest sibling node on the left */
            rightsibling: undefined, /** The current node's closest sibling node on the right */
            leftneighbor: undefined, /** The current node's nearest neighbour to the left, at the same level */
            xcoord:               0, /** The current node's x-coordinate */
            ycoord:               0, /** The current node's y-coordinate */
            prelim:               0, /** The current node's preliminary x-coordinate */
            modifier:             0, /** The current node's modifier value */
        }
        TreeStructure.__initializeTree(root)
    }

    /**
     * Traces the bottom contour of the tree until the left-most neighbor is found
     * @param {{ children: any[]; __meta: { parent: any; leftneighbor: any; leftsibling: any; } }} node
     */
    static __nearestNeighbor(node) {
        if (node.__meta.leftsibling)
        { return node.__meta.leftsibling }

        let d = 1
        let next = node.__meta.parent
        while (d > 0 && next) {
            // try to go left and then down (or just left)
            if (next.__meta.leftneighbor) {
                next = next.__meta.leftneighbor
                while (next.children.length > 0 && d > 0) {
                    next = next.children[next.children.length - 1]
                    d--
                }
            }
            // otherwise try to go up one
            else {
                next = next.__meta.parent
                d++
            }
        }
        return next
    }

    /**
     * Sets initial values and resolves node relations
     * @param {{ children: any[]; __meta: { firstchild: any; parent: any; leftneighbor: any; leftsibling: any; rightsibling: any } }} node
     */
    static __initializeTree(node) {
        if (node.children.length > 0)
        { node.__meta.firstchild = node.children[0] }
        if (node.__meta.parent) {
            let index = node.__meta.parent.children.indexOf(node)
            if (index < 0)
                throw new Error('unexpected error: node is not a child of parent')
            if (index > 0)
                node.__meta.leftsibling = node.__meta.parent.children[index - 1]
            if (index < (node.__meta.parent.children.length - 1))
                node.__meta.rightsibling = node.__meta.parent.children[index + 1]
            node.__meta.leftneighbor = TreeStructure.__nearestNeighbor(node)
        }
        node.children.forEach((/** @type {any} */ child) => {
            child.__meta = Object.assign(child.__meta || {}, {
                parent: node,
                firstchild: undefined,
                leftsibling: undefined,
                rightsibling: undefined,
                leftneighbor: undefined,
                xcoord: 0,
                ycoord: 0,
                prelim: 0,
                modifier: 0
            })
            TreeStructure.__initializeTree(child)
        })
    }

    /**
     * In this first post-order walk, every node of the rtee is assigned a preliminary
     * x-coordinate. In addition, internal nodes are given modifiers, which will be
     * used to move their offspring to the right.
     * @param {any} node
     * @param {number} level
     */
    static __firstwalk(node, level) {
        /**
         * Set the default modifier value.
         */
        node.__meta.modifier = 0

        if (node.children.length === 0 || level === TreeStructure.MaxDepth) {
            if (node.__meta.leftsibling) {
                /**
                 * Determine the preliminary x-coordinate based on:
                 * the preliminary x-coorinate of the left sibling,
                 * the separation between sibling node, and the
                 * mean size of left sibling and current node.
                 */
                node.__meta.prelim =
                    node.__meta.leftsibling.__meta.prelim +
                    TreeStructure.SiblingSeparation +
                    TreeStructure.__meanNodeSize(node.__meta.leftsibling, node)
            }
            /* No sibling on the left to worry about */
            else node.__meta.prelim = 0
        }
        else {
            /**
             * This Node is not a leaf, so call this procedure
             * recursively for each of its offspring
             */
            let leftmost = node.__meta.firstchild
            let rightmost = leftmost
            TreeStructure.__firstwalk(leftmost, level + 1)
            while (rightmost.__meta.rightsibling) {
                rightmost = rightmost.__meta.rightsibling
                TreeStructure.__firstwalk(rightmost, level + 1)
            }

            let midpoint = (leftmost.__meta.prelim + rightmost.__meta.prelim) / 2

            if (node.__meta.leftsibling) {
                node.__meta.prelim =
                    node.__meta.leftsibling.__meta.prelim +
                    TreeStructure.SiblingSeparation +
                    TreeStructure.__meanNodeSize(node.__meta.leftsibling, node)
                node.__meta.modifier = node.__meta.prelim - midpoint
                TreeStructure.__apportion(node, level)
            }
            else
                node.__meta.prelim = midpoint
        }
    }

    /**
     * This function returns the mean size of the two passed nodes. It
     * adds the size of the right half of the left-hand node to the
     * left half of the right-hand node. If all nodes are the same,
     * this is a trivial calculation.
     * @param {any} leftNode
     * @param {any} rightNode
     * @returns {number}
     */
    static __meanNodeSize(leftNode, rightNode) {
        let nodeSize = 0
        if (leftNode) nodeSize += TreeStructure.NodeSize
        if (rightNode) nodeSize += TreeStructure.NodeSize
        return nodeSize
    }

    /**
     * This procedure cleans up the positioning of small sibling subtrees, thus fixing the 'left-to-right'
     * problem evident in earlier algorithms. When moving a new subtree further and further to the right,
     * gaps may open up among smaller subtrees that were previously sandwiched between larger subtrees.
     * Thus, when moving the new, larger subtree to the right, the distance it is moved is also apportioned
     * to smaller, interior subtrees, creating a pleasing aesthetic placement.
     * @param {any} node 
     * @param {number} level 
     */
    static __apportion(node, level) {
        let leftmost = node.__meta.firstchild
        let neighbor = leftmost.__meta.leftneighbor
        let compareDepth = 1
        let depthToStop = TreeStructure.MaxDepth - level

        while ((leftmost && neighbor) && compareDepth <= depthToStop) {
            /**
             * Compute the location of Leftmost and where it should be with respect to Neightbor.
             */
            let leftModsum = 0
            let rightModsum = 0
            let ancestorLeftmost = leftmost
            let ancestorNeighbor = neighbor

            for (let i = 0; i < compareDepth; i++) {
                ancestorLeftmost = ancestorLeftmost.__meta.parent
                ancestorNeighbor = ancestorNeighbor.__meta.parent
                rightModsum += ancestorLeftmost.__meta.modifier
                leftModsum += ancestorNeighbor.__meta.modifier
            }

            /**
             * Find the MoveDistance, and apply it to Node's subtree.
             * Add appropriate portions to smaller interior subtrees.
             */
            let moveDistance =
                neighbor.__meta.prelim +
                leftModsum +
                TreeStructure.SubtreeSeparation +
                TreeStructure.__meanNodeSize(leftmost, neighbor) -
                (leftmost.__meta.prelim + rightModsum)

            if (moveDistance > 0) {
                /* Count interior sibling subtrees in LeftSiblings */
                let tempPtr = node
                let leftSiblings = 0
                while (tempPtr && tempPtr !== ancestorNeighbor) {
                    leftSiblings++
                    tempPtr = tempPtr.__meta.leftsibling
                }

                if (tempPtr) {
                    /* Apply portions to appropriate leftsibling subtrees */
                    let portion = moveDistance / leftSiblings
                    tempPtr = node
                    while (tempPtr !== ancestorNeighbor) {
                        tempPtr.__meta.prelim += moveDistance
                        tempPtr.__meta.modifier += moveDistance
                        moveDistance -= portion
                        tempPtr = tempPtr.__meta.leftsibling
                    }
                }
                /**
                 * Don't need to move anything--it needs to
                 * be done by an ancestor because
                 * AnestorNeighbor and AncestorLeftmost are
                 * not siblings of each other
                 */
                else return
            }

            /**
             * Determine the leftmost descendant of Node at the next
             * lower level to compare its positioning against that of
             * its Neighbor
             */
            compareDepth++
            if (leftmost.children.length === 0)
                leftmost = TreeStructure.__getLeftMost(node, 0, compareDepth)
            else leftmost = leftmost.__meta.firstchild
            if (leftmost) neighbor = leftmost.__meta.leftneighbor
        }
    }

    /**
     * This function returns the leftmost descendant of a node at a given depth.
     * This is implemented using a post-order walk of the subtree under node,
     * down to the level of depth. Level here is not the absolute tree level
     * used in the two main tree walks; it refers to the level below the node
     * whose leftmost descendant is being found.
     * @param {any} node 
     * @param {number} level 
     * @param {number} depth 
     * @returns {any}
     */
    static __getLeftMost(node, level, depth) {
        if (level >= depth) return node
        else if (node.children.length === 0) return undefined
        else {
            let rightmost = node.__meta.firstchild
            let leftmost = TreeStructure.__getLeftMost(rightmost, level + 1, depth)

            /* Do a postorder walk of the subtree below Node. */
            while (!leftmost && rightmost.__meta.rightsibling) {
                rightmost = rightmost.__meta.rightsibling
                leftmost = TreeStructure.__getLeftMost(rightmost, level + 1, depth)
            }

            return leftmost
        }
    }

    /**
     * During a second pre-order walk, each node is given a final x-coordinate by summing
     * its preliminary x-coordinate and the modifiers of all the node's ancestors. The
     * y-coordinate depends on the height of the tree. If the actial position of an
     * interior node is right of its preliminary place, the subtree rooted at the node
     * must be moved right to the center the sons around the fother.  Rather than
     * immediately readjust all the nodes in the subtree, each node remembers the
     * distance to the provisional place in a modifier field. In this second pass down
     * the tree, modifiers are accumulated and applied to9 every node.
     * @param {any} node
     * @param {number} level
     * @param {number} modsum
     * @returns {boolean} Returns true if no errors, otherwise returns false.
     */
    static __secondwalk(node, level, modsum) {
        let result = true

        if (level <= TreeStructure.MaxDepth) {
            let xTemp = TreeStructure.xTopAdjustment + node.__meta.prelim + modsum
            let yTemp = TreeStructure.yTopAdjustment + (level * TreeStructure.LevelSeparation)

            /**
             * Check to see that xTemp and yTemp are of the proper size for your application.
             */
            if (TreeStructure.__checkExtentsRange(xTemp, yTemp)) {
                node.__meta.xcoord = xTemp
                node.__meta.ycoord = yTemp
                node.pos.x = xTemp
                node.pos.y = yTemp
                if (node.children.length > 0)
                    /**
                     * Apply the modifier value for this node to all its offspring
                     */
                    result = TreeStructure.__secondwalk(
                        node.__meta.firstchild, level + 1, modsum + node.__meta.modifier)
                if (result && node.__meta.rightsibling)
                    result = TreeStructure.__secondwalk(
                        node.__meta.rightsibling, level, modsum)
            }
            /* Continue would put the tree outside of the drawable extents range */
            else result = false
        }
        /* We are at a level deeper than what we want to draw */
        else result = true

        return result
    }

    /**
     * This function verifies that the passed x- and y-coordinates are within the
     * coordinate system being used for the drawing. For example, if the x- and
     * y-coordinates must be two-byte integers, this function could determine
     * whether xValue and yValue are too large.
     * @param {number} _xValue 
     * @param {number} _yValue 
     * @returns {boolean}
     */
    static __checkExtentsRange(_xValue, _yValue)
    { return true }
}
