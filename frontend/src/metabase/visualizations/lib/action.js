/* eslint-disable react/prop-types */
import _ from "underscore";

import { openUrl } from "metabase/redux/app";

export function performAction(action, { dispatch, onChangeCardAndRun }) {
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
      dispatch(openUrl(url));
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

export function performDefaultAction(actions, props) {
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
