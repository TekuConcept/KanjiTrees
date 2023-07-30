// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

import inspect from './NodeJSInspector.mjs'

const classRegExp = /^([A-Z][a-z0-9]*)+$/;
// Sorted by a rough estimate on most frequently used entries.
const kTypes = [
    'string',
    'function',
    'number',
    'object',
    // Accept 'Function' and 'Object' as alternative to the lower cased version.
    'Function',
    'Object',
    'boolean',
    'bigint',
    'symbol',
];

/**
 * Only use this for integers! Decimal numbers do not work with this
 * function.
 * @param {string} val 
 * @returns {string}
 */
function addNumericalSeparator(val) {
    let res = '';
    let i = val.length;
    const start = val[0] === '-' ? 1 : 0;
    for (; i >= start + 4; i -= 3)
        res = `_${val.slice(i - 3, i)}${res}`;
    return `${val.slice(0, i)}${res}`;
}

export class ERR_UNHANDLED_ERROR extends Error {
    /**
     * @param {string} err 
     */
    constructor(err = undefined) {
        const msg = 'Unhandled error.';
        if (err === undefined)
            super(msg);
        else super(`${msg} (${err})`)
        this.context = undefined
    }
}

export class ERR_OUT_OF_RANGE extends RangeError {
    /**
     * @param {string} str
     * @param {string} range
     * @param {unknown} input
     */
    constructor(str, range, input, replaceDefaultBoolean = false) {
        if (!range) throw new Error('Missing "range" argument')
        let msg = replaceDefaultBoolean ? str :
            `The value of "${str}" is out of range.`;
        let received;
        // @ts-ignore
        if (Number.isInteger(input) && Math.abs(input) > 2 ** 32) {
            received = addNumericalSeparator(String(input));
        }
        else if (typeof input === 'bigint') {
            received = String(input);
            if (input > 2n ** 32n || input < -(2n ** 32n))
                received = addNumericalSeparator(received);
            received += 'n';
        }
        else received = inspect(input);
        msg += ` It must be ${range}. Received ${received}`;
        super(msg)
    }
}

export class ERR_INVALID_ARG_TYPE extends TypeError {
    constructor(name, expected, actual) {
        if (typeof name !== 'string')
            throw new TypeError("'name' must be a string");
        if (!Array.isArray(expected))
        { expected = [expected]; }
    
        let msg = 'The ';
        if (name.endsWith(' argument')) {
            // For cases like 'first argument'
            msg += `${name} `;
        }
        else {
            const type = name.includes('.') ? 'property' : 'argument';
            msg += `"${name}" ${type} `;
        }
        msg += 'must be ';
    
        const types = [];
        const instances = [];
        const other = [];
    
        for (const value of expected) {
            if (typeof value !== 'string')
                throw new TypeError('All expected entries have to be of type string');
            if (kTypes.includes(value))
            { types.push(value.toLowerCase()); }
            else if (classRegExp.test(value))
            { instances.push(value); }
            else {
                if (value === 'object')
                    throw new TypeError('The value "object" should be written as "Object"');
                other.push(value);
            }
        }
    
        // Special handle `object` in case other instances are allowed to outline
        // the differences between each other.
        if (instances.length > 0) {
            const pos = types.indexOf('object');
            if (pos !== -1) {
                types.splice(pos, 1);
                instances.push('Object');
            }
        }
    
        if (types.length > 0) {
            if (types.length > 2) {
                const last = types.pop();
                msg += `one of type ${types.join(', ')}, or ${last}`;
            }
            else if (types.length === 2)
                msg += `one of type ${types[0]} or ${types[1]}`;
            else msg += `of type ${types[0]}`;
            if (instances.length > 0 || other.length > 0)
            msg += ' or ';
        }
    
        if (instances.length > 0) {
            if (instances.length > 2) {
                const last = instances.pop();
                msg += `an instance of ${instances.join(', ')}, or ${last}`;
            }
            else {
                msg += `an instance of ${instances[0]}`;
                if (instances.length === 2)
                { msg += ` or ${instances[1]}`; }
            }
            if (other.length > 0)
                msg += ' or ';
        }
    
        if (other.length > 0) {
            if (other.length > 2) {
                const last = other.pop();
                msg += `one of ${other.join(', ')}, or ${last}`;
            }
            else if (other.length === 2)
                msg += `one of ${other[0]} or ${other[1]}`;
            else {
                if (other[0].toLowerCase() !== other[0])
                    msg += 'an ';
                msg += `${other[0]}`;
            }
        }
    
        if (actual == null)
        { msg += `. Received ${actual}`; }
        else if (typeof actual === 'function' && actual.name)
        { msg += `. Received function ${actual.name}`; }
        else if (typeof actual === 'object') {
            if (actual.constructor && actual.constructor.name)
            { msg += `. Received an instance of ${actual.constructor.name}`; }
            else {
                const inspected = inspect(actual, { depth: -1 });
                msg += `. Received ${inspected}`;
            }
        }
        else {
            let inspected = inspect(actual, { colors: false });
            if (inspected.length > 25)
            inspected = `${inspected.slice(0, 25)}...`;
            msg += `. Received type ${typeof actual} (${inspected})`;
        }

        super(msg)
    }
}
