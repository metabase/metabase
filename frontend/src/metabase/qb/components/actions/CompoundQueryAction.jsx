/* @flow */

import { nestThisQuery } from "metabase/qb/lib/actions";

import type {
    ClickAction,
    ClickActionProps
} from "metabase/meta/types/Visualization";

export default ({ card, tableMetadata }: ClickActionProps): ClickAction[] => {
    // we can only nest a query if it's already saved
    if (card.id) {
        return [
            {
                name: "nest-query",
                title: "Analyze the results of this Query",
                icon: "table",
                card: () => nestThisQuery(card)
            }
        ];
    }
    return [];
};
