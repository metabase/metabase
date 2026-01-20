import { push } from "react-router-redux";
import _ from "underscore";

import { setParameterValuesFromQueryParams } from "metabase/dashboard/actions/parameters";
import { open } from "metabase/lib/dom";

export function performAction(
  action,
  { dispatch, onChangeCardAndRun, onUpdateQuestion },
) {
  if (action.onClick) {
    action.onClick();
    return true;
  }

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
    const ignoreSiteUrl = action.ignoreSiteUrl;
    if (url) {
      open(url, {
        openInSameOrigin: (location) => {
          dispatch(push(location));
          dispatch(setParameterValuesFromQueryParams(location.query));
        },
        ignoreSiteUrl,
      });
      didPerform = true;
    }
  }
  if (action.question) {
    const { questionChangeBehavior = "changeCardAndRun" } = action;

    const question = action.question();
    const extra = action?.extra?.() ?? {};

    if (question) {
      if (questionChangeBehavior === "changeCardAndRun") {
        onChangeCardAndRun({
          nextCard: question.card(),
          ...extra,
          objectId: extra.objectId,
        });
      } else if (questionChangeBehavior === "updateQuestion") {
        onUpdateQuestion(question);
      }

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
  const action = _.find(actions, (action) => action.defaultAlways === true);
  if (action) {
    return performAction(action, props);
  }

  // TODO: Consider refactoring (@kulyk)
  if (actions.length <= 2) {
    const sortAsc = actions.find((action) => action.name === "sort.ascending");
    const sortDesc = actions.find(
      (action) => action.name === "sort.descending",
    );
    if (sortAsc && sortDesc) {
      performAction(sortAsc, props);
    }
  }

  if (
    actions.length === 1 &&
    (actions[0].name === "sort.ascending" ||
      actions[0].name === "sort.descending")
  ) {
    performAction(actions[0], props);
  }

  return false;
}

/**
 * Performs the first available drill action (single-click drilldown).
 * This bypasses the action menu and directly executes a drill action.
 * Priority: 1) Actions with url/question 2) First available action
 */
export function performSingleClickDrilldown(actions, props) {
  if (!actions || actions.length === 0) {
    return false;
  }

  // Prefer actions that have a url or question (navigation/drill actions)
  const drillAction = actions.find(
    (action) => action.url || action.question || action.onClick,
  );

  if (drillAction) {
    return performAction(drillAction, props);
  }

  // Fall back to first action if no drill-specific action found
  return performAction(actions[0], props);
}
