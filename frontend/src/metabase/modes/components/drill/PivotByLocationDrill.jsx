/* @flow */

import PivotByLocationAction from "../actions/PivotByLocationAction";

import type {
  ClickAction,
  ClickActionProps,
} from "metabase/meta/types/Visualization";

export default (props: ClickActionProps): ClickAction[] => {
  return PivotByLocationAction(props);
};
