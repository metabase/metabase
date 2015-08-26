
import d3 from "d3";

var precisionNumberFormatter = d3.format(".2r");
var fixedNumberFormatter = d3.format(",.f");

export function formatNumber(number) {
    if (number > -1 && number < 1) {
        // numbers between 1 and -1 round to 2 significant digits with extra 0s stripped off
        return precisionNumberFormatter(number).replace(/\.?0+$/, "");
    } else {
        // anything else rounds to at most 2 decimal points
        return fixedNumberFormatter(d3.round(number, 2));
    }
}
