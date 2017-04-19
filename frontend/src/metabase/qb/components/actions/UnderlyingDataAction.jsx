/* @flow */

import { toUnderlyingData } from "metabase/qb/lib/actions";

import type {
    ClickAction,
    ClickActionProps
} from "metabase/meta/types/Visualization";

export default ({ card, tableMetadata }: ClickActionProps): ClickAction[] => {
    if (card.display !== "table" && card.display !== "scalar") {
        return [
            {
                title: "View the underlying data",
                icon: "table",
                card: () => toUnderlyingData(card)
            }
        ];
    }
    return [];
};
