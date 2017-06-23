/* @flow */

import { pivot, drillDownForDimensions } from "metabase/qb/lib/actions";

import type {
    ClickAction,
    ClickActionProps
} from "metabase/meta/types/Visualization";

export default (
    { card, tableMetadata, clicked }: ClickActionProps
): ClickAction[] => {
    const dimensions = (clicked && clicked.dimensions) || [];
    const drilldown = drillDownForDimensions(dimensions);
    if (!drilldown) {
        return [];
    }

    return [
        {
            name: "timeseries-zoom",
            section: "zoom",
            title: "Zoom in",
            card: () =>
                pivot(card, drilldown.breakout, tableMetadata, dimensions)
        }
    ];
};
