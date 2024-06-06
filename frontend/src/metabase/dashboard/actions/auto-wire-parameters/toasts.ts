import { t } from "ttag";
import _ from "underscore";

import type { SetMultipleDashCardAttributesOpts } from "metabase/dashboard/actions";
import {
  setDashCardAttributes,
  setMultipleDashCardAttributes,
} from "metabase/dashboard/actions";
import { addUndo, dismissUndo } from "metabase/redux/undo";
import type {
  QuestionDashboardCard,
  DashCardId,
  DashboardParameterMapping,
  Parameter,
} from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

export const AUTO_WIRE_TOAST_ID = _.uniqueId();
const AUTO_WIRE_UNDO_TOAST_ID = _.uniqueId();

export const showAutoWireParametersToast =
  ({
    dashcardAttributes,
    originalDashcardAttributes,
    fieldName,
    multipleTabs,
  }: {
    dashcardAttributes: SetMultipleDashCardAttributesOpts;
    originalDashcardAttributes: SetMultipleDashCardAttributesOpts;
    fieldName: string;
    multipleTabs: boolean;
  }) =>
  (dispatch: Dispatch) => {
    let message = "";

    if (multipleTabs) {
      message = t`Auto-connect this filter to all questions containing “${fieldName}”, in the current tab?`;
    } else {
      message = t`Auto-connect this filter to all questions containing “${fieldName}”?`;
    }

    dispatch(
      addUndo({
        id: AUTO_WIRE_TOAST_ID,
        icon: null,
        message,
        actionLabel: t`Auto-connect`,
        timeout: 12000,
        undo: false,
        action: () => {
          connectAll();
          showUndoToast();
        },
      }),
    );

    function connectAll() {
      dispatch(
        setMultipleDashCardAttributes({
          dashcards: dashcardAttributes,
        }),
      );
    }

    function revertConnectAll() {
      dispatch(
        setMultipleDashCardAttributes({
          dashcards: originalDashcardAttributes,
        }),
      );
    }

    function showUndoToast() {
      dispatch(
        addUndo({
          id: AUTO_WIRE_UNDO_TOAST_ID,
          message: t`The filter was auto-connected to all questions containing “${fieldName}”.`,
          actionLabel: t`Undo`,
          timeout: 12000,
          undo: true,
          action: revertConnectAll,
        }),
      );
    }
  };

export const showAddedCardAutoWireParametersToast =
  ({
    targetDashcard,
    dashcard_id,
    parametersToAutoApply,
    parameters,
  }: {
    targetDashcard: QuestionDashboardCard;
    dashcard_id: DashCardId;
    parametersToAutoApply: DashboardParameterMapping[];
    parameters: Parameter[];
  }) =>
  (dispatch: Dispatch) => {
    let message = "";

    if (parametersToAutoApply.length === 1) {
      message = t`Auto-connect “${targetDashcard.card.name}” to “${parameters[0].name}”?`;
    } else {
      message = t`Auto-connect “${targetDashcard.card.name}” to ${parametersToAutoApply.length} filters with the same field?`;
    }

    const toastId = _.uniqueId();

    dispatch(
      addUndo({
        id: toastId,
        icon: null,
        message,
        actionLabel: t`Auto-connect`,
        undo: true,
        timeout: 12000,
        action: () => {
          closeAutoWireParameterToast(toastId);
          autoWireParametersToNewCard();
          showUndoToast();
        },
      }),
    );

    function autoWireParametersToNewCard() {
      dispatch(
        setDashCardAttributes({
          id: dashcard_id,
          attributes: {
            parameter_mappings: parametersToAutoApply,
          },
        }),
      );
    }

    function revertAutoWireParametersToNewCard() {
      dispatch(
        setDashCardAttributes({
          id: dashcard_id,
          attributes: {
            parameter_mappings: [],
          },
        }),
      );
    }

    function showUndoToast() {
      let message = "";

      if (parametersToAutoApply.length === 1) {
        message = t`“${targetDashcard.card.name}” was auto-connected to “${parameters[0].name}”.`;
      } else {
        message = t`“${targetDashcard.card.name}” was auto-connected to ${parametersToAutoApply.length} filters.`;
      }

      dispatch(
        addUndo({
          id: _.uniqueId(),
          message,
          actionLabel: t`Undo`,
          timeout: 12000,
          undo: true,
          action: revertAutoWireParametersToNewCard,
        }),
      );
    }
  };

export const closeAutoWireParameterToast =
  (toastId: string = AUTO_WIRE_TOAST_ID) =>
  (dispatch: Dispatch) => {
    dispatch(dismissUndo(toastId, false));
  };
