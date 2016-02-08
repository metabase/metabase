
import _ from "underscore";

/// return pair of [min, max] values from items in array DATA, using VALUEACCESSOR to retrieve values for each item
/// VALUEACCESSOR may be an accessor function like fn(ITEM) or can be a string/integer key/index into ITEM which will
/// use a function like fn(item) { return item(KEY); }
export function getMinMax(data, valueAccessor) {
    if (typeof valueAccessor === 'string' || typeof valueAccessor === 'number') {
        var key = valueAccessor;
        valueAccessor = function(d) {
            return d[key];
        };
    }

    var values = _.map(data, valueAccessor);
    return _.reduce(values, function(acc, val) {
        var min = acc[0],
            max = acc[1];
        return [
            min < val ? min : val,
            max > val ? max : val
        ];
    }, [values[0], values[0]]);
}
