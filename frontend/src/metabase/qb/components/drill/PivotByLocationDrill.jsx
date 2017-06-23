/* @flow */

import PivotByLocationAction from "../actions/PivotByLocationAction";

import type {
    ClickAction,
    ClickActionProps
} from "metabase/meta/types/Visualization";

export default (
    { card, tableMetadata, clicked }: ClickActionProps
): ClickAction[] => {
    return PivotByLocationAction({ card, tableMetadata, clicked });
};
