import type { LocationDescriptorObject } from "history";
import { push } from "react-router-redux";
import _ from "underscore";

import { open } from "metabase/utils/dom";
import type Question from "metabase-lib/v1/Question";
import type { Dispatch } from "metabase-types/store";

import type {
  ClickAction,
  OnChangeCardAndRun,
  QuestionChangeClickAction,
} from "../types";

type ActionProps = {
  dispatch: Dispatch;
  onChangeCardAndRun?: OnChangeCardAndRun;
  onUpdateQuestion?: (question: Question) => void;
  onSameOriginNavigation?: (location: LocationDescriptorObject) => void;
};

export function performAction(
  action: ClickAction,
  props: ActionProps,
): boolean {
  const { dispatch, onChangeCardAndRun, onUpdateQuestion } = props;

  if ("onClick" in action && action.onClick) {
    action.onClick({ dispatch, closePopover: () => undefined });
    return true;
  }

  let didPerform = false;
  if ("action" in action) {
    const reduxAction = action.action();
    if (reduxAction) {
      dispatch(reduxAction);
      didPerform = true;
    }
  }

  if ("url" in action) {
    const url = action.url();
    const ignoreSiteUrl = action.ignoreSiteUrl;
    if (url) {
      open(url, {
        openInSameOrigin: (location) => {
          if (props.onSameOriginNavigation) {
            props.onSameOriginNavigation(location);
          } else {
            dispatch(push(location));
          }
        },
        ignoreSiteUrl,
      });
      didPerform = true;
    }
  }

  if (isQuestionChangeClickAction(action)) {
    const { questionChangeBehavior = "changeCardAndRun" } = action;
    const question = action.question();
    const extra = action.extra?.() ?? {};
    const objectId =
      typeof extra.objectId === "number" ? extra.objectId : undefined;

    if (question) {
      if (questionChangeBehavior === "changeCardAndRun") {
        onChangeCardAndRun?.({
          nextCard: question.card(),
          ...extra,
          objectId,
        });
      } else if (questionChangeBehavior === "updateQuestion") {
        onUpdateQuestion?.(question);
      }

      didPerform = true;
    }
  }
  return didPerform;
}

export function performDefaultAction(
  actions: ClickAction[] | null | undefined,
  props: ActionProps,
): boolean {
  if (!actions) {
    return false;
  }

  // "default" action if there's only one
  if (actions.length === 1 && "default" in actions[0] && actions[0].default) {
    return performAction(actions[0], props);
  }

  // "defaultAlways" action even if there's more than one
  const action = _.find(
    actions,
    (candidate) =>
      "defaultAlways" in candidate && candidate.defaultAlways === true,
  );
  if (action) {
    return performAction(action, props);
  }

  // TODO: Consider refactoring (@kulyk)
  if (actions.length <= 2) {
    const sortAsc = actions.find(
      (candidate) => candidate.name === "sort.ascending",
    );
    const sortDesc = actions.find(
      (candidate) => candidate.name === "sort.descending",
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

function isQuestionChangeClickAction(
  action: ClickAction,
): action is QuestionChangeClickAction {
  return "question" in action;
}
