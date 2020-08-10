/* @flow */

import { open } from "metabase/lib/dom";

import _ from "underscore";

import type { ClickAction } from "metabase-types/types/Visualization";

type PerformActionProps = {
  dispatch: Function,
  onChangeCardAndRun: Function,
};

export function performAction(
  action: ClickAction,
  { dispatch, onChangeCardAndRun }: PerformActionProps,
) {
  let didPerform = false;
  if (action.action) {
    const reduxAction = action.action();
    if (reduxAction) {
      dispatch(reduxAction);
      didPerform = true;
    }
  }
  if (action.url) {
    const url = action.url();
    if (url) {
      open(url);
      didPerform = true;
    }
  }
  if (action.question) {
    const question = action.question();
    if (question) {
      onChangeCardAndRun({ nextCard: question.card() });
      didPerform = true;
    }
  }
  return didPerform;
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
