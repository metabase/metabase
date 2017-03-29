/* @flow weak */

import { plotSegmentField } from "metabase/qb/lib/actions";

export default ({ card, tableMetadata }) => {
    if (card.display !== "table") {
        return;
    }
    return {
        title: "Plot a field in this segment",
        icon: "bar",
        card: () => plotSegmentField(card)
    };
};
