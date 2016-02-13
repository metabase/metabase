import d3 from "d3";

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
