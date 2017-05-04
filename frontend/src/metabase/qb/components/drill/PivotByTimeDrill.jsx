/* @flow */

import PivotByTimeAction from "../actions/PivotByTimeAction";

import type {
    ClickAction,
    ClickActionProps
} from "metabase/meta/types/Visualization";

export default (
    { card, tableMetadata, clicked }: ClickActionProps
): ClickAction[] => {
    return PivotByTimeAction({ card, tableMetadata, clicked });
};
