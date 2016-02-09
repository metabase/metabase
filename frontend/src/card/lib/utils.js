
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

// computed size properties (drop 'px' and convert string -> Number)
function getComputedSizeProperty(prop, element) {
    var val = document.defaultView.getComputedStyle(element, null).getPropertyValue(prop);
    return val ? parseFloat(val.replace("px", "")) : null;
}

/// height available for rendering the card
export function getAvailableCanvasHeight(element) {
    var parent = element.parentElement,
        parentHeight = getComputedSizeProperty("height", parent),
        parentPaddingTop = getComputedSizeProperty("padding-top", parent),
        parentPaddingBottom = getComputedSizeProperty("padding-bottom", parent);

    // NOTE: if this magic number is not 3 we can get into infinite re-render loops
    return parentHeight - parentPaddingTop - parentPaddingBottom - 3; // why the magic number :/
}

/// width available for rendering the card
export function getAvailableCanvasWidth(element) {
    var parent = element.parentElement,
        parentWidth = getComputedSizeProperty("width", parent),
        parentPaddingLeft = getComputedSizeProperty("padding-left", parent),
        parentPaddingRight = getComputedSizeProperty("padding-right", parent);

    return parentWidth - parentPaddingLeft - parentPaddingRight;
}
