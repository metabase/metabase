/* @flow */

import type {
    ClickAction,
    ClickActionProps
} from "metabase/meta/types/Visualization";

export default ({ question }: ClickActionProps): ClickAction[] => {
    // currently time series xrays require the maximum fidelity
    if (
        question.card().id &&
        question.canXray() &&
        question.xrayCost() === "extended"
    ) {
        return [
            {
                name: "xray-card",
                title: "XRay this question",
                icon: "beaker",
                url: () => `/xray/card/${question.card().id}/extended`
            }
        ];
    } else {
        return [];
    }
};
