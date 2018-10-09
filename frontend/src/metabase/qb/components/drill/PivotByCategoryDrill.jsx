/* @flow */

import PivotByCategoryAction from "../actions/PivotByCategoryAction";

import type {
  ClickAction,
  ClickActionProps,
} from "metabase/meta/types/Visualization";

export default (props: ClickActionProps): ClickAction[] => {
  return PivotByCategoryAction(props);
};
