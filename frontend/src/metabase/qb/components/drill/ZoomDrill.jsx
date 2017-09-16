/* @flow */

import { drillDownForDimensions } from "metabase/qb/lib/actions";

import type {
    ClickAction,
    ClickActionProps
} from "metabase/meta/types/Visualization";

export default (
    { question, clicked, settings }: ClickActionProps
): ClickAction[] => {
    const dimensions = (clicked && clicked.dimensions) || [];
    const drilldown = drillDownForDimensions(dimensions, question.metadata());
    if (!drilldown) {
        return [];
    }

    return [
        {
            name: "timeseries-zoom",
            section: "zoom",
            title: "Zoom in",
            question: () => question.pivot(drilldown.breakouts, dimensions)
        }
    ];
};
