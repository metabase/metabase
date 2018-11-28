/* @flow */

import { open } from "metabase/lib/dom";

import _ from "underscore";

import type { ClickAction } from "metabase/meta/types/Visualization";

type PerformActionProps = {
  dispatch: Function,
  onChangeCardAndRun: Function,
};

export function performAction(
  action: ClickAction,
  { dispatch, onChangeCardAndRun }: PerformActionProps,
) {
  if (action.action) {
    const reduxAction = action.action();
    if (reduxAction) {
      dispatch(reduxAction);
      return true;
    }
  }
  if (action.url) {
    const url = action.url();
    if (url) {
      open(url);
      return true;
    }
  }
  if (action.question) {
    const question = action.question();
    if (question) {
      onChangeCardAndRun({ nextCard: question.card() });
      return true;
    }
  }
  return false;
}

export function performDefaultAction(
  actions: ClickAction[],
  props: PerformActionProps,
) {
  if (!actions) {
    return false;
  }

  // "default" action if there's only one
  if (actions.length === 1 && actions[0].default) {
    return performAction(actions[0], props);
  }

  // "defaultAlways" action even if there's more than one
  const action = _.find(actions, action => action.defaultAlways === true);
  if (action) {
    return performAction(action, props);
  }

  return false;
}
