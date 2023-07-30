
'use strict';


/**
 * Echos the value of any input. Tries to print the value out
 * in the best way possible given the different types.
 *
 * @param {any} value The value to print out.
 * @param {any} opts
 * @returns {string}
 */
function inspect(value, opts) {
    const getCircularReplacer = () => {
        const seen = new WeakSet();
        return (_key, value) => {
            if (typeof value === "object" && value !== null) {
                if (seen.has(value)) return;
                seen.add(value);
            }
            return value;
        };
    };
    return JSON.stringify(value, getCircularReplacer());
}

export default inspect
