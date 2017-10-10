/// Utility functions used by both the LineAreaBar renderer and the RowRenderer

import { parseTimestamp } from "metabase/lib/time";

import { getAvailableCanvasWidth, getAvailableCanvasHeight } from "./utils";

export const NULL_DIMENSION_WARNING = "Data includes missing dimension values.";

export function initChart(chart, element) {
    // set the bounds
    chart.width(getAvailableCanvasWidth(element));
    chart.height(getAvailableCanvasHeight(element));
    // disable animations
    chart.transitionDuration(0);
    // disable brush
    if (chart.brushOn) {
        chart.brushOn(false);
    }
}

export function makeIndexMap(values: Array<Value>): Map<Value, number> {
    let indexMap = new Map()
    for (const [index, key] of values.entries()) {
        indexMap.set(key, index);
    }
    return indexMap;
}

type CrossfilterGroup = {
    top: (n: number) => { key: any, value: any },
    all: () => { key: any, value: any },
}

// HACK: This ensures each group is sorted by the same order as xValues,
// otherwise we can end up with line charts with x-axis labels in the correct order
// but the points in the wrong order. There may be a more efficient way to do this.
export function forceSortedGroup(group: CrossfilterGroup, indexMap: Map<Value, number>): void {
    // $FlowFixMe
    const sorted = group.top(Infinity).sort((a, b) => indexMap.get(a.key) - indexMap.get(b.key));
    for (let i = 0; i < sorted.length; i++) {
        sorted[i].index = i;
    }
    group.all = () => sorted;
}

export function forceSortedGroupsOfGroups(groupsOfGroups: CrossfilterGroup[][], indexMap: Map<Value, number>): void {
    for (const groups of groupsOfGroups) {
        for (const group of groups) {
            forceSortedGroup(group, indexMap)
        }
    }
}

/*
 * The following functions are actually just used by LineAreaBarRenderer but moved here in interest of making that namespace more concise
 */

export function reduceGroup(group, key, warnUnaggregated) {
    return group.reduce(
        (acc, d) => {
            if (acc == null && d[key] == null) {
                return null;
            } else {
                if (acc != null) {
                    warnUnaggregated();
                    return acc + (d[key] || 0);
                } else {
                    return (d[key] || 0);
                }
            }
        },
        (acc, d) => {
            if (acc == null && d[key] == null) {
                return null;
            } else {
                if (acc != null) {
                    warnUnaggregated();
                    return acc - (d[key] || 0);
                } else {
                    return - (d[key] || 0);
                }
            }
        },
        () => null
    );
}

export function fillMissingValues(datas, xValues, fillValue, getKey = (v) => v) {
    try {
        return datas.map(rows => {
            const fillValues = rows[0].slice(1).map(d => fillValue);

            let map = new Map();
            for (const row of rows) {
                map.set(getKey(row[0]), row);
            }
            let newRows = xValues.map(value => {
                const key = getKey(value);
                const row = map.get(key);
                if (row) {
                    map.delete(key);
                    return [value, ...row.slice(1)];
                } else {
                    return [value, ...fillValues];
                }
            });
            if (map.size > 0) {
                console.warn("xValues missing!", map, newRows)
            }
            return newRows;
        });
    } catch (e) {
        console.warn(e);
        return datas;
    }
}

// Crossfilter calls toString on each moment object, which calls format(), which is very slow.
// Replace toString with a function that just returns the unparsed ISO input date, since that works
// just as well and is much faster
function moment_fast_toString() {
    return this._i;
}

export function HACK_parseTimestamp(value, unit, warn) {
    if (value == null) {
        warn(NULL_DIMENSION_WARNING);
        return null;
    } else {
        let m = parseTimestamp(value, unit);
        m.toString = moment_fast_toString
        return m;
    }
}

export function hasRemappingAndValuesAreStrings({ cols }, i = 0) {
    const column = cols[i];

    if (column.remapping && column.remapping.size > 0) {
        // We have remapped values, so check their type for determining whether the dimension is numeric
        // ES6 Map makes the lookup of first value a little verbose
        return typeof column.remapping.values().next().value === "string";
    } else {
        return false
    }
}
