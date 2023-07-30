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

/**
 * @module EventEmitter
 */

'use strict'

import inspect from './NodeJSInspector.mjs';
import {
    ERR_UNHANDLED_ERROR,
    ERR_OUT_OF_RANGE,
    ERR_INVALID_ARG_TYPE
} from './NodeJSErrors.mjs'

/**
 * The EventEmitter instance will emit its own 'newListener' event before a
 * listener is added to its internal array of listeners.
 * 
 * Listeners registered for the 'newListener' event are passed the event
 * name and a reference to the listener being added.
 * 
 * The fact that the event is triggered before adding the listener has a
 * subtle but important side effect: any additional listeners registered
 * to the same name within the 'newListener' callback are inserted before
 * the listener that is in the process of being added.
 * @event EventEmitter#newListener
 * @param {string|symbol} eventName
 * @param {Function} listener
 */

/**
 * The 'removeListener' event is emitted after the listener is removed.
 * @event EventEmitter#removeListener
 * @param {string|symbol} eventName 
 */

const kCapture                     = Symbol('kCapture');
const kErrorMonitor                = Symbol('events.errorMonitor');
const kRejection                   = Symbol('rejection');
const kEnhanceStackBeforeInspector = Symbol('kEnhanceStackBeforeInspector');

/**
 * Returns the length and line number of the first sequence of `a`
 * that fully appears in `b` with a length of at least 4.
 * @param {string | any[]} a
 * @param {string | any[]} b
 */
function identicalSequenceRange(a, b) {
    for (let i = 0; i < a.length - 3; i++) {
        // Find the first entry of b that matches the current entry of a.
        const pos = b.indexOf(a[i]);
        if (pos !== -1) {
            const rest = b.length - pos;
            if (rest > 3) {
                let len = 1;
                const maxLen = Math.min(a.length - i, rest);
                // Count the number of consecutive entries.
                while (maxLen > len && a[i + len] === b[pos + len])
                { len++; }
                if (len > 3) return [len, i];
            }
        }
    }
  
    return [0, 0];
}

/**
 * @param {Error} err
 * @param {Error} own
 */
function enhanceStackTrace(err, own) {
    let ctorInfo = '';
    try {
        const { name } = this.constructor;
        if (name !== 'EventEmitter')
            ctorInfo = ` on ${name} instance`;
    } catch {}
    const sep = `\nEmitted 'error' event${ctorInfo} at:\n`;
  
    const errStack = err.stack.split('\n').slice(1);
    const ownStack = own.stack.split('\n').slice(1);
  
    const { 0: len, 1: off } = identicalSequenceRange(ownStack, errStack);
    if (len > 0) {
        ownStack.splice(off + 1, len - 2,
            '    [... lines matching original stack trace ...]');
    }
  
    return err.stack + sep + ownStack.join('\n');
}

/**
 * @param {EventEmitter} ee
 * @param {any} err
 * @param {any} type
 * @param {any} args
 */
function emitUnhandledRejectionOrErr(ee, err, type, args) {
    if (typeof ee[kRejection] === 'function')
    { ee[kRejection](err, type, ...args); }
    else {
        // We have to disable the capture rejections mechanism, otherwise
        // we might end up in an infinite loop.
        const prev = ee[kCapture];
    
        // If the error handler throws, it is not catcheable and it
        // will end up in 'uncaughtException'. We restore the previous
        // value of kCapture in case the uncaughtException is present
        // and the exception is handled.
        try {
            ee[kCapture] = false;
            ee.emit('error', err);
        }
        finally { ee[kCapture] = prev; }
    }
}

/**
 * @param {EventEmitter} that
 * @param {Promise<any>} promise
 * @param {string | symbol} type
 * @param {any[]} args
 */
function addCatch(that, promise, type, args) {
    if (!that[kCapture]) return;
  
    // Handle Promises/A+ spec, then could be a getter
    // that throws on second use.
    try {
        const then = promise.then;
        if (typeof then === 'function') {
            then.call(promise, undefined, function(err) {
                // The callback is called with nextTick to avoid a follow-up
                // rejection from this promise.
                process.nextTick(emitUnhandledRejectionOrErr, that, err, type, args);
            });
        }
    }
    catch (err) { that.emit('error', err); }
}

/**
 * @param {any[]} arr
 */
function arrayClone(arr) {
    // At least since V8 8.3, this implementation is faster than the previous
    // which always used a simple for-loop
    switch (arr.length) {
        case 2: return [arr[0], arr[1]];
        case 3: return [arr[0], arr[1], arr[2]];
        case 4: return [arr[0], arr[1], arr[2], arr[3]];
        case 5: return [arr[0], arr[1], arr[2], arr[3], arr[4]];
        case 6: return [arr[0], arr[1], arr[2], arr[3], arr[4], arr[5]];
    }
    return arr.slice();
}

/**
 * @param {Function} listener
 */
function checkListener(listener) {
    if (typeof listener !== 'function')
        throw new ERR_INVALID_ARG_TYPE('listener', 'Function', listener);
}

/**
 * @param {any[]} arr
 */
function unwrapListeners(arr) {
    const ret = arrayClone(arr);
    for (let i = 0; i < ret.length; ++i) {
        const orig = ret[i].listener;
        if (typeof orig === 'function')
            ret[i] = orig;
    }
    return ret;
}

function onceWrapper() {
    if (!this.fired) {
        // @ts-ignore
        this.target.removeListener(this.type, this.wrapFn);
        this.fired = true;
        if (arguments.length === 0)
            // @ts-ignore
            return this.listener.call(this.target);
        // @ts-ignore
        return this.listener.apply(this.target, arguments);
    }
}

/**
 * As of V8 6.6, depending on the size of the array, this is anywhere
 * between 1.5-10x faster than the two-arg version of Array#splice()
 * @param {void[]} list
 * @param {number} index
 */
function spliceOne(list, index) {
    for (; index + 1 < list.length; index++)
        list[index] = list[index + 1];
    list.pop();
}

export default class EventEmitter {
    static defaultMaxListeners = 10;
    // static _construct = (() => {
    // })()

    constructor() {
        this._events = undefined;
        this._eventsCount = 0;
        this._maxListeners = undefined;
    }

    /**
     * Adds a listener to the event emitter.
     * @param {string | symbol} eventName
     * @param {Function} listener
     * @returns {EventEmitter}
     */
    addListener(eventName, listener) {
        return EventEmitter._addListener(this, eventName, listener, false);
    }

    static _addListener(target, type, listener, prepend) {
        let m;
        let events;
        let existing;
      
        checkListener(listener);
      
        events = target._events;
        if (events === undefined) {
            events = target._events = Object.create(null);
            target._eventsCount = 0;
        }
        else {
            // To avoid recursion in the case that type === "newListener"! Before
            // adding it to the listeners, first emit "newListener".
            if (events.newListener !== undefined) {
                target.emit('newListener', type,
                            listener.listener ?? listener);
        
                // Re-assign `events` because a newListener handler could have caused the
                // this._events to be assigned to a new object
                events = target._events;
            }
            existing = events[type];
        }
      
        if (existing === undefined) {
            // Optimize the case of one listener. Don't need the extra array object.
            events[type] = listener;
            ++target._eventsCount;
        }
        else {
            if (typeof existing === 'function') {
                // Adding the second element, need to change to array.
                existing = events[type] =
                    prepend ? [listener, existing] : [existing, listener];
                // If we've already got an array, just append.
            }
            else if (prepend) existing.unshift(listener);
            else existing.push(listener);
      
            // Check for listener leak
            m = EventEmitter._getMaxListeners(target);
            if (m > 0 && existing.length > m && !existing.warned) {
                existing.warned = true;
                // No error code for this since it is a Warning
                // eslint-disable-next-line no-restricted-syntax
                const w = new Error('Possible EventEmitter memory leak detected. ' +
                    `${existing.length} ${String(type)} listeners ` +
                    `added to ${inspect(target, { depth: -1 })}. Use ` +
                    'emitter.setMaxListeners() to increase limit');
                w.name = 'MaxListenersExceededWarning';
                // @ts-ignore
                w.emitter = target;
                // @ts-ignore
                w.type = type;
                // @ts-ignore
                w.count = existing.length;
                process.emitWarning(w);
            }
        }
      
        return target;
    }

    /**
     * Synchronously calls each of the listeners registered for
     * the event.
     * 
     * Returns true if the event had listeners, false otherwise.
     * @param {string|symbol} eventName 
     * @param  {...any} [args] 
     * @returns {boolean}
     */
    emit(eventName, ...args) {
        let doError = (eventName === 'error');

        const events = this._events;
        if (events !== undefined) {
            if (doError && events[kErrorMonitor] !== undefined)
            this.emit(kErrorMonitor, ...args);
            doError = (doError && events.error === undefined);
        }
        else if (!doError) return false;

        // If there is no 'error' event listener then throw.
        if (doError) {
            let er;
            if (args.length > 0) er = args[0];
            if (er instanceof Error) {
                try {
                    const capture = {};
                    Error.captureStackTrace(capture, EventEmitter.prototype.emit);
                    Object.defineProperty(er, kEnhanceStackBeforeInspector, {
                        value: Function.prototype.bind(enhanceStackTrace, this, er, capture),
                        configurable: true
                    });
                } catch {}

                // Note: The comments on the `throw` lines are intentional, they show
                // up in Node's output if this results in an unhandled exception.
                throw er; // Unhandled 'error' event
            }

            let stringifiedEr;
            try { stringifiedEr = inspect(er); }
            catch { stringifiedEr = er; }

            // At least give some kind of context to the user
            const err = new ERR_UNHANDLED_ERROR(stringifiedEr);
            err.context = er;
            throw err; // Unhandled 'error' event
        }

        const handler = events[eventName];

        if (handler === undefined)
        return false;

        if (typeof handler === 'function') {
            const result = handler.apply(this, args);

            // We check if result is undefined first because that
            // is the most common case so we do not pay any perf
            // penalty
            if (result !== undefined && result !== null)
            { addCatch(this, result, eventName, args); }
        }
        else {
            const len = handler.length;
            const listeners = arrayClone(handler);
            for (let i = 0; i < len; ++i) {
                const result = listeners[i].apply(this, args);

                // We check if result is undefined first because that
                // is the most common case so we do not pay any perf
                // penalty.
                // This code is duplicated because extracting it away
                // would make it non-inlineable.
                if (result !== undefined && result !== null)
                { addCatch(this, result, eventName, args); }
            }
        }

        return true;
    }

    /**
     * Returns an array listing the events for which
     * the emitter has registered listeners.
     * @returns {any[]}
     */
    eventNames() {
        return this._eventsCount > 0 ? Reflect.ownKeys(this._events) : [];
    }

    /**
     * Returns the current max listener value for the event emitter.
     * @returns {Number}
     */
    getMaxListeners() {
        return EventEmitter._getMaxListeners(this);
    }

    /**
     * @param {EventEmitter} that
     */
    static _getMaxListeners(that) {
        if (that._maxListeners === undefined)
            return EventEmitter.defaultMaxListeners;
        return that._maxListeners;
    }

    /**
     * Returns the number of listeners listening to the event name
     * specified as `type`.
     * @deprecated since v3.2.0
     * @param {string | symbol} eventName
     * @returns {number}
     */
    listenerCount(eventName) {
        const events = this._events;

        if (events !== undefined) {
            const evlistener = events[eventName];

            if (typeof evlistener === 'function')
                return 1;
            else if (evlistener !== undefined)
                return evlistener.length;
        }

        return 0;
    }

    /**
     * Returns a copy of the array of listeners for the event name
     * specified as `type`.
     * @param {string | symbol} eventName
     * @returns {Function[]}
     */
    listeners(eventName) {
        return EventEmitter._listeners(this, eventName, true);
    }

    /**
     * @param {EventEmitter} target
     * @param {string | number | symbol} type
     * @param {boolean} unwrap
     */
    static _listeners(target, type, unwrap) {
        const events = target._events;

        if (events === undefined) return [];

        const evlistener = events[type];
        if (evlistener === undefined) return [];

        if (typeof evlistener === 'function')
            return unwrap ? [evlistener.listener || evlistener] : [evlistener];

        return unwrap ? unwrapListeners(evlistener) : arrayClone(evlistener);
    }

    /**
     * Alias for emitter.removeListener().
     * 
     * Returns a reference to the EventEmitter, so that calls can be chained.
     * @param {string|symbol} eventName 
     * @param {Function} listener 
     * @returns {EventEmitter}
     */
    off(eventName, listener) {
        return this.removeListener(eventName, listener);
    }

    /**
     * Adds the listener function to the end of the listeners array for the
     * event named eventName. No checks are made to see if the listener has
     * already been added. Multiple calls passing the same combination of
     * eventName and listener will result in the listener being added, and
     * called, multiple times.
     * 
     * Returns a reference to the EventEmitter, so that calls can be chained.
     * @param {string|symbol} eventName 
     * @param {Function} listener 
     * @returns {EventEmitter}
     */
    on(eventName, listener) {
        return this.addListener(eventName, listener);
    }

    /**
     * Adds a one-time `listener` function to the event emitter.
     * @param {string | symbol} eventName
     * @param {Function} listener
     * @returns {EventEmitter}
     */
    once(eventName, listener) {
        checkListener(listener);
        this.on(eventName, EventEmitter._onceWrap(this, eventName, listener));
        return this;
    }

    /**
     * @param {EventEmitter} target
     * @param {string | symbol} type
     * @param {Function} listener
     */
    static _onceWrap(target, type, listener) {
        const state = { fired: false, wrapFn: undefined, target, type, listener };
        const wrapped = onceWrapper.bind(state);
        wrapped.listener = listener;
        state.wrapFn = wrapped;
        return wrapped;
    }

    /**
     * Adds the `listener` function to the beginning of
     * the listeners array.
     * @param {string | symbol} eventName
     * @param {Function} listener
     * @returns {EventEmitter}
     */
    prependListener(eventName, listener) {
        return EventEmitter._addListener(this, eventName, listener, true);
    }

    /**
     * Adds a one-time `listener` function to the beginning of
     * the listeners array.
     * @param {string | symbol} eventName
     * @param {Function} listener
     * @returns {EventEmitter}
     */
    prependOnceListener(eventName, listener) {
        checkListener(listener);

        this.prependListener(eventName, EventEmitter._onceWrap(this, eventName, listener));
        return this;
    }

    /**
     * Removes all listeners from the event emitter. (Only
     * removes listeners for a specific event name if specified
     * as `type`).
     * @param {string | symbol} [eventName]
     * @returns {EventEmitter}
     */
    removeAllListeners(eventName) {
        const events = this._events;
        if (events === undefined)
          return this;
  
        // Not listening for removeListener, no need to emit
        if (events.removeListener === undefined) {
            if (arguments.length === 0) {
                this._events = Object.create(null);
                this._eventsCount = 0;
            }
            else if (events[eventName] !== undefined) {
                if (--this._eventsCount === 0)
                    this._events = Object.create(null);
                else delete events[eventName];
            }
            return this;
        }
  
        // Emit removeListener for all listeners on all events
        if (arguments.length === 0) {
            for (const key of Reflect.ownKeys(events)) {
                if (key === 'removeListener') continue;
                this.removeAllListeners(key);
            }
            this.removeAllListeners('removeListener');
            this._events = Object.create(null);
            this._eventsCount = 0;
            return this;
        }
  
        const listeners = events[eventName];
  
        if (typeof listeners === 'function') {
            this.removeListener(eventName, listeners);
        }
        else if (listeners !== undefined) {
            // LIFO order
            for (let i = listeners.length - 1; i >= 0; i--) {
                this.removeListener(eventName, listeners[i]);
            }
        }
  
        return this;
    }

    /**
     * Removes the specified `listener` from the listeners array.
     * @param {string | symbol} eventName
     * @param {Function} listener
     * @returns {EventEmitter}
     */
    removeListener(eventName, listener) {
        checkListener(listener);
  
        const events = this._events;
        if (events === undefined)
            return this;
  
        const list = events[eventName];
        if (list === undefined)
            return this;
  
        if (list === listener || list.listener === listener) {
            if (--this._eventsCount === 0)
                this._events = Object.create(null);
            else {
                delete events[eventName];
                if (events.removeListener)
                    this.emit('removeListener', eventName, list.listener || listener);
            }
        }
        else if (typeof list !== 'function') {
            let position = -1;
    
            for (let i = list.length - 1; i >= 0; i--) {
                if (list[i] === listener || list[i].listener === listener) {
                    position = i;
                    break;
                }
            }
  
            if (position < 0)
                return this;
  
            if (position === 0)
                list.shift();
            else spliceOne(list, position);

            if (list.length === 1)
                events[eventName] = list[0];
  
            if (events.removeListener !== undefined)
                this.emit('removeListener', eventName, listener);
        }
  
        return this;
    }

    /**
     * Increases the max listeners of the event emitter.
     * 
     * Returns a reference to the EventEmitter, so that calls can be chained.
     * @param {Number} n 
     * @returns {EventEmitter}
     */
    setMaxListeners(n) {
        if (typeof n !== 'number' || n < 0 || Number.isNaN(n))
            throw new ERR_OUT_OF_RANGE('n', 'a non-negative number', n);
        this._maxListeners = n;
        return this;
    }

    /**
     * Returns a copy of the array of listeners and wrappers for
     * the event name specified as `type`.
     * @param {string | symbol} type
     * @returns {Function[]}
     */
    rawListeners = function rawListeners(type) {
        return EventEmitter._listeners(this, type, false);
    };
}
