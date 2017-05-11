/* @flow */

import { plotSegmentField } from "metabase/qb/lib/actions";

import type {
    ClickAction,
    ClickActionProps
} from "metabase/meta/types/Visualization";

export default ({ card, tableMetadata }: ClickActionProps): ClickAction[] => {
    if (card.display !== "table") {
        return [];
    }
    return [
        {
            name: "plot",
            title: "Plot a field in this segment",
            icon: "bar",
            card: () => plotSegmentField(card)
        }
    ];
};
