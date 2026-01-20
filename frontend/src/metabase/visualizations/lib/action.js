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

// Priority order for single-click drill actions
// Zoom drills are preferred as they provide the "drill down" experience
const SINGLE_CLICK_DRILL_PRIORITY = [
  "drill-thru/zoom-in.timeseries",
  "drill-thru/zoom-in.binning",
  "drill-thru/zoom-in.geographic",
  "drill-thru/zoom",
  "drill-thru/quick-filter",
  "drill-thru/fk-filter",
  "drill-thru/column-filter",
  "drill-thru/underlying-records",
  "drill-thru/pk",
  "drill-thru/fk-details",
];

function getClickBehaviorType(clicked) {
  if (!clicked || !clicked.settings) {
    return null;
  }

  const settings = clicked.settings;
  const columnSettings =
    clicked.column && settings.column
      ? settings.column(clicked.column)
      : {};

  const clickBehavior =
    columnSettings?.click_behavior || settings.click_behavior;

  return clickBehavior?.type || null;
}

function findPrimaryDrillAction(actions) {
  // Try to find a drill action based on priority
  for (const drillType of SINGLE_CLICK_DRILL_PRIORITY) {
    const action = actions.find(
      (a) => a.name === drillType || a.type === drillType,
    );
    if (action) {
      return action;
    }
  }

  // Fall back to any action in the "zoom" section first
  const zoomAction = actions.find((a) => a.section === "zoom");
  if (zoomAction) {
    return zoomAction;
  }

  // Then try "records" section
  const recordsAction = actions.find((a) => a.section === "records");
  if (recordsAction) {
    return recordsAction;
  }

  // Finally, return the first actionable drill (not sort or info)
  return actions.find(
    (a) =>
      a.section !== "sort" &&
      a.section !== "info" &&
      a.section !== "details" &&
      a.section !== "custom",
  );
}

export function performDefaultAction(actions, props, clicked) {
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

  // Check for singleClickDrill behavior - auto-execute primary drill action
  const clickBehaviorType = getClickBehaviorType(clicked);
  if (clickBehaviorType === "singleClickDrill" && actions.length > 0) {
    const primaryAction = findPrimaryDrillAction(actions);
    if (primaryAction) {
      return performAction(primaryAction, props);
    }
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
