var _ = require("underscore");

var screens = {
    ObjectId: /[0-9a-fA-F]{24}/,
    'string': function(value) {
        if (typeof value === 'string') return value;
    },
    'number': function(value) {
        if (typeof value === 'number') return value;
    },
    'boolean': function(value) {
        if (typeof value === 'boolean') return value;
    },
    'date': function(value) {
        if (value instanceof Date) return value;
    },
    'regexp': function(value) {
        if (value instanceof RegExp) return value;
    },
    'function': function(value) {
        if (typeof value === 'function') return value;
    },
    'object': function(value) {
        if (typeof value === 'object') return value;
    }
};

function specType(spec) {
    if (typeof spec === 'object') {
        if (Array.isArray(spec)) return 'array';
        if (spec === null) return "null";
        return 'object';
    } else return typeof spec;
}

var globalSpec = {
    "_id": "string", // TODO: regexp
    "_ctime": "date",
    "_mtime": "date"
};

function screen(object, spec) {
    var result, prop, propResult;

    var specT = specType(spec);
    if (specT === 'array') {
        if (!Array.isArray(object)) return;
        return object
            .map(function(x) { return screen(x, spec[0]) })
            .filter(function(x) { return x });
    } else if (specT === 'string') {
        return screen(object, screens[spec]);
    } else if (specT === 'function') {
        return spec(object);
    }
    // true means whitelist whole object
    else if (specT === 'boolean' && spec === true) {
        return object;
    }
    else if (specT === 'regexp' && typeof object === 'string') {
        var reMatch = object.match(spec);
        if (reMatch && reMatch[0].length == object.length) return object;
    } else if (specT === 'object') {
        result = object || {};
        // check for existance of properties in the global spec (which can whitelist fields in any object)
        for (prop in object) {
            if (typeof globalSpec[prop] === 'undefined') continue;
            propResult = screen(object[prop], globalSpec[prop]);

            if (typeof propResult !== 'undefined') {
                result[prop] = propResult;
            }
        }

        for (prop in spec) {
            if (typeof object[prop] === 'undefined') {
                result[prop] = (specType(spec[prop]) === 'array') ? [] : null; // TODO: fill better
            }
            
            propResult = screen(object[prop], spec[prop]);

            // otherwise copy the result normally
            if (typeof propResult !== 'undefined') {
                result[prop] = propResult;
            }
            else result[prop] = null; // TODO: fill better

            //    throw new Error("Screen failed for: " + prop);
            
            // or fill with null if requested
        }
        
        for (prop in object) {
            if (! (spec.hasOwnProperty(prop) || globalSpec.hasOwnProperty(prop)))
                delete object[prop];
        }
        
        return result;
    }
}

screen.define = function(name, screenFunction) {
    screens[name] = screenFunction;
};

screen.or = function() {
    var screens = arguments;
    return function(value) {
        var i, res;
        var input = value,
            output;
        for (i = 0; i < screens.length; ++i) {
            res = screen(input, screens[i]);
            if (typeof res !== 'undefined') {
                input = res;
                output = res;
            }
        }
        return output;
    };
};

screen.and = function() {
    var screens = arguments;
    return function(value) {
        var i;
        var res = value;
        for (i = 0; i < screens.length; ++i) {
            res = screen(res, screens[i]);
            if (typeof res === 'undefined') return undefined;
        }
        return res;
    };
};

module.exports = screen;
