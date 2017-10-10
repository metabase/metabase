/// Utility functions used by both the LineAreaBar renderer and the RowRenderer

import { getAvailableCanvasWidth, getAvailableCanvasHeight } from "./utils";

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
