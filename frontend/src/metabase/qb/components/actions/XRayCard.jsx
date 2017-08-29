/* @flow */

import type {
    ClickAction,
    ClickActionProps
} from "metabase/meta/types/Visualization";

export default ({ question }: ClickActionProps): ClickAction[] => {
    if (question.card().id) {
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
