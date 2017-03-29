/* @flow weak */

import { toUnderlyingData } from "metabase/qb/lib/actions";

export default ({ card, tableMetadata }) => {
    if (card.display !== "table" && card.display !== "scalar") {
        return {
            title: "View the underlying data",
            icon: "table",
            card: () => toUnderlyingData(card)
        };
    }
};
