import { push } from "react-router-redux";
import _ from "underscore";

import { setParameterValuesFromQueryParams } from "metabase/dashboard/actions/parameters";
import { open } from "metabase/lib/dom";

export interface PerformActionProps {
  dispatch: (action: unknown) => void;
  onChangeCardAndRun: (opts: {
    nextCard: { id?: number | null };
    objectId?: number;
    [key: string]: unknown;
  }) => void;
  onUpdateQuestion: (question: { card: () => { id?: number | null } }) => void;
}

export interface ClickAction {
  onClick?: () => void;
  action?: () => unknown;
  url?: () => string | undefined;
  ignoreSiteUrl?: boolean;
  question?: () => { card: () => { id?: number | null } } | null;
  questionChangeBehavior?: "changeCardAndRun" | "updateQuestion";
  extra?: () => Record<string, unknown>;
  name?: string;
  default?: boolean;
  defaultAlways?: boolean;
}

export function performAction(
  action: ClickAction,
  { dispatch, onChangeCardAndRun, onUpdateQuestion }: PerformActionProps,
): boolean {
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
        openInSameOrigin: (location: {
          query: Record<string, string | string[]>;
        }) => {
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
          objectId: extra.objectId as number | undefined,
        });
      } else if (questionChangeBehavior === "updateQuestion") {
        onUpdateQuestion(question);
      }

      didPerform = true;
    }
  }
  return didPerform;
}

export function performDefaultAction(
  actions: ClickAction[] | null | undefined,
  props: PerformActionProps,
): boolean {
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
