import d3 from "d3";

function getElementIndex(e) {
    return [...e.classList].map(c => c.match(/^_(\d+)$/)).filter(c => c).map(c => parseInt(c[1], 10))[0];
}


export function getPieSliceTextElement(element) {
    let index = getElementIndex(element);
    return element.parentNode.querySelector("text.pie-slice._"+index);
}

// HACK: This determines the index of the series the provided element belongs to since DC doesn't seem to provide another way
export function determineSeriesIndexFromElement(element) {
    // composed charts:
    let e = element;
    while (e && e.classList && !e.classList.contains("sub")) {
        e = e.parentNode;
    }
    if (e && e.classList) {
        return getElementIndex(e);
    }
    // stacked charts:
    e = element;
    while (e && e.classList && !e.classList.contains("dc-tooltip") && !e.classList.contains("stack")) {
        e = e.parentNode;
    }
    if (e && e.classList) {
        return getElementIndex(e);
    }
    // none?
    return null;
}

export function getPieSliceCentroid(element, slice) {
    let parent = element.parentNode.parentNode;
    let radius = parent.getBoundingClientRect().height / 2;
    let innerRadius = 0;

    let centroid = d3.svg.arc()
        .outerRadius(radius).innerRadius(innerRadius)
        .padAngle(slice.padAngle).startAngle(slice.startAngle).endAngle(slice.endAngle)
        .centroid();

    let pieRect = parent.getBoundingClientRect();

    return {
        x: pieRect.left + radius + centroid[0],
        y: pieRect.top + radius + centroid[1]
    };
}
