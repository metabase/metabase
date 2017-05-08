
// TODO: better handle paths
const LEFT_HANDLE_PATH = "M-0.5,76.69275 L-6.5,82.69275 V147.3855 L-0.5,153.3855Z M-2.5,84.69275 V145.3855 M-4.5,84.69275 V145.3855";
const RIGHT_HANDLE_PATH = "M0.5,76.69275  L6.5,82.69275 V147.3855  L0.5,153.3855Z M2.5,84.69275  V145.3855  M4.5,84.69275 V145.3855";

export function initBrushParent(parent, onBrushEnd) {
    parent.on("pretransition", function(chart) {
        // move brush to the back so tootips/clicks still work
        var brushNode = chart.select("g.brush").node();
        if (brushNode && brushNode.parentNode) {
            brushNode.parentNode.insertBefore(
                brushNode,
                brushNode.parentNode.firstChild
            );
        }
        // customize the handles
        chart.select(".brush .resize.w path").attr("d", LEFT_HANDLE_PATH);
        chart.select(".brush .resize.e path").attr("d", RIGHT_HANDLE_PATH);
    });
    parent.on("renderlet", chart => {
        chart.svg().on("mouseup", () => {
            onBrushEnd();
        });
    });
}

export function initBrushChild(chart, onDragBrush) {
    // enable brush
    if (chart.brushOn) {
        chart.brushOn(true);
    }
    // normally dots are disabled if brush is on but we want them anyway
    if (chart.xyTipsOn) {
        chart.xyTipsOn("always");
    }
    // fires on mouse move
    chart.addFilterHandler((filters, [start, end]) => {
        onDragBrush(start, end);
        // return existing filters, we don't want to actually change them
        return filters;
    });
}
