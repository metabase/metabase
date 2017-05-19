import { KEYCODE_ESCAPE } from "metabase/lib/keyboard";

export function initBrush(parent, child, onBrushChange, onBrushEnd) {
    if (!child.brushOn) {
        return;
    }

    // enable brush
    child.brushOn(true);

    // normally dots are disabled if brush is on but we want them anyway
    if (child.xyTipsOn) {
        child.xyTipsOn("always");
    }

    // the brush has been cancelled by pressing escape
    let cancelled = false;
    // the last updated range when brushing
    let range = null;

    // start
    parent.brush().on("brushstart.custom", () => {
        // reset "cancelled" flag
        cancelled = false;
        // add "dragging" class to chart
        parent.svg().classed("dragging", true);
        // move the brush element to the front
        moveToFront(parent.select(".brush").node());
        // add an escape keydown listener
        window.addEventListener("keydown", onKeyDown, true);
    });

    // change
    child.addFilterHandler((filters, r) => {
        // update "range" with new filter range
        range = r;

        // emit "onBrushChange" event
        onBrushChange(range);

        // fade deselected bars
        parent.fadeDeselectedArea();

        // return filters unmodified
        return filters;
    });

    // end
    parent.brush().on("brushend.custom", () => {
        // remove the "dragging" classed
        parent.svg().classed("dragging", false)
        // reset brush opacity (if the brush was cancelled)
        parent.select(".brush").style("opacity", 1);
        // move the brush to the back
        moveToBack(parent.select(".brush").node());
        // remove the escape keydown listener
        window.removeEventListener("keydown", onKeyDown, true);
        // reset the fitler and redraw
        child.filterAll();
        parent.redraw();

        // if not cancelled, emit the onBrushEnd event with the last filter range
        onBrushEnd(cancelled ? null : range);
    });

    // cancel
    const onKeyDown = e => {
        if (e.keyCode === KEYCODE_ESCAPE) {
            // set the "cancelled" flag
            cancelled = true;
            // dispatch a mouseup to end brushing early
            window.dispatchEvent(new MouseEvent("mouseup"));
        }
    };

    parent.on("pretransition.custom", function(chart) {
        // move brush to the back so tootips/clicks still work
        moveToBack(chart.select(".brush").node());
        // remove the handles since we can't adjust them anyway
        chart.selectAll(".brush .resize").remove();
    });
}

function moveToBack(element) {
    if (element && element.parentNode) {
        element.parentNode.insertBefore(
            element,
            element.parentNode.firstChild
        );
    }
}
function moveToFront(element) {
    if (element && element.parentNode) {
        element.parentNode.appendChild(element);
    }
}
