/* @flow */

import PivotByTimeAction from "../actions/PivotByTimeAction";

import type {
  ClickAction,
  ClickActionProps,
} from "metabase/meta/types/Visualization";

export default (props: ClickActionProps): ClickAction[] => {
  return PivotByTimeAction(props);
};
