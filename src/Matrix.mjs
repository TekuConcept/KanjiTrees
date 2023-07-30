
export default class Matrix {
    constructor() {
        this.data = [
            1, 0, 0,
            0, 1, 0,
            0, 0, 1
        ]
    }

    /**
     * @returns {{x:number;y:number}}
     */
    get scale() {
        return {
            x: this.data[0],
            y: this.data[4]
        }
    }
    /**
     * @param {{x:number;y:number}} value
     */
    set scale(value) {
        this.data[0] = value.x
        this.data[4] = value.y
    }

    /**
     * @returns {{x:number;y:number}}
     */
    get translation() {
        return {
            x: this.data[2],
            y: this.data[5]
        }
    }
    /**
     * @param {{x:number;y:number}} value
     */
    set translation(value) {
        this.data[2] = value.x
        this.data[5] = value.y
    }

    /**
     * @param {number} x 
     * @param {number} y 
     * @returns {Matrix}
     */
    static createScale(x, y) {
        let res = new Matrix()
        res.data[0] = x
        res.data[4] = y
        return res
    }

    /**
     * @param {number} x 
     * @param {number} y 
     * @returns {Matrix}
     */
    static createTranslation(x, y) {
        let res = new Matrix()
        res.data[2] = x
        res.data[5] = y
        return res
    }

    /**
     * @param {Matrix} that
     * @returns {Matrix}
     */
    mul(that) {
        let res = new Matrix()
        res.data = [
            this.data[0] * that.data[0] + this.data[1] * that.data[3] + this.data[2] * that.data[6],
            this.data[0] * that.data[1] + this.data[1] * that.data[4] + this.data[2] * that.data[7],
            this.data[0] * that.data[2] + this.data[1] * that.data[5] + this.data[2] * that.data[8],

            this.data[3] * that.data[0] + this.data[4] * that.data[3] + this.data[5] * that.data[6],
            this.data[3] * that.data[1] + this.data[4] * that.data[4] + this.data[5] * that.data[7],
            this.data[3] * that.data[2] + this.data[4] * that.data[5] + this.data[5] * that.data[8],

            this.data[6] * that.data[0] + this.data[7] * that.data[3] + this.data[8] * that.data[6],
            this.data[6] * that.data[1] + this.data[7] * that.data[4] + this.data[8] * that.data[7],
            this.data[6] * that.data[2] + this.data[7] * that.data[5] + this.data[8] * that.data[8],
        ]
        return res
    }

    /**
     * @param {{x:number;y:number}} vec 
     * @returns {{x:number;y:number}}
     */
    transform(vec) {
        return {
            x: vec.x * this.data[0] + vec.y * this.data[1] + this.data[2],
            y: vec.x * this.data[3] + vec.y * this.data[4] + this.data[5]
        }
    }
}