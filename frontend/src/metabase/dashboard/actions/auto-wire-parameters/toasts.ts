import { t } from "ttag";
import _ from "underscore";

import type { SetMultipleDashCardAttributesOpts } from "metabase/dashboard/actions";
import {
  setDashCardAttributes,
  setMultipleDashCardAttributes,
} from "metabase/dashboard/actions";
import type { Dispatch, GetState } from "metabase/redux/store";
import { addUndo, dismissUndo } from "metabase/redux/undo";
import type {
  DashCardId,
  DashboardParameterMapping,
  Parameter,
  ParameterId,
  QuestionDashboardCard,
} from "metabase-types/api";

import {
  AUTO_WIRE_TOAST_TIMEOUT,
  AUTO_WIRE_UNDO_TOAST_TIMEOUT,
} from "./constants";

const SHOW_AUTO_WIRE_PARAMETERS_TOAST_TYPE = "SHOW_AUTO_WIRE_PARAMETERS_TOAST";

export const showAutoWireParametersToast =
  ({
    dashcardAttributes,
    originalDashcardAttributes,
    columnName,
    hasMultipleTabs,
    parameterId,
  }: {
    dashcardAttributes: SetMultipleDashCardAttributesOpts;
    originalDashcardAttributes: SetMultipleDashCardAttributesOpts;
    columnName: string;
    hasMultipleTabs: boolean;
    parameterId: ParameterId;
  }) =>
  (dispatch: Dispatch) => {
    const message = hasMultipleTabs
      ? t`Auto-connect this filter to all questions containing “${columnName}”, in the current tab?`
      : t`Auto-connect this filter to all questions containing “${columnName}”?`;

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
          message: t`The filter was auto-connected to all questions containing “${columnName}”.`,
          actionLabel: t`Undo`,
          showProgress: true,
          timeout: AUTO_WIRE_UNDO_TOAST_TIMEOUT,
          type: "filterAutoConnectDone",
          extraInfo: {
            dashcardIds: dashcardAttributes.map(({ id }) => id),
            parameterId,
          },
          action: revertConnectAll,
        }),
      );
    }

    return dispatch(
      addUndo({
        icon: null,
        type: SHOW_AUTO_WIRE_PARAMETERS_TOAST_TYPE,
        message,
        actionLabel: t`Auto-connect`,
        showProgress: true,
        timeout: AUTO_WIRE_TOAST_TIMEOUT,
        action: () => {
          connectAll();
          showUndoToast();
        },
      }),
    );
  };

export const showAddedCardAutoWireParametersToast =
  ({
    targetDashcard,
    dashcard_id,
    parametersMappingsToApply,
    parametersToMap,
  }: {
    targetDashcard: QuestionDashboardCard;
    dashcard_id: DashCardId;
    parametersMappingsToApply: DashboardParameterMapping[];
    parametersToMap: Parameter[];
  }) =>
  (dispatch: Dispatch) => {
    const shouldShowParameterName = parametersMappingsToApply.length === 1;
    const message = shouldShowParameterName
      ? t`Auto-connect “${targetDashcard.card.name}” to “${parametersToMap[0].name}”?`
      : t`Auto-connect “${targetDashcard.card.name}” to ${parametersMappingsToApply.length} filters with the same field?`;

    const toastId = _.uniqueId();

    dispatch(
      addUndo({
        id: toastId,
        icon: null,
        type: "filterAutoConnect",
        message,
        actionLabel: t`Auto-connect`,
        showProgress: true,
        timeout: AUTO_WIRE_TOAST_TIMEOUT,
        action: () => {
          dispatch(dismissUndo({ undoId: toastId }));
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
            parameter_mappings: parametersMappingsToApply,
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
      const message = shouldShowParameterName
        ? t`“${targetDashcard.card.name}” was auto-connected to “${parametersToMap[0].name}”.`
        : t`“${targetDashcard.card.name}” was auto-connected to ${parametersToMap.length} filters.`;

      dispatch(
        addUndo({
          message,
          showProgress: true,
          timeout: AUTO_WIRE_UNDO_TOAST_TIMEOUT,
          type: "filterAutoConnect",
          action: revertAutoWireParametersToNewCard,
        }),
      );
    }
  };

export const closeAutoWireParameterToast =
  () => (dispatch: Dispatch, getState: GetState) => {
    const undos = getState().undo;

    for (const undo of undos) {
      if (undo.type === SHOW_AUTO_WIRE_PARAMETERS_TOAST_TYPE) {
        dispatch(dismissUndo({ undoId: undo.id }));
      }
    }
  };

const autoWireToastTypes = ["filterAutoConnect", "filterAutoConnectDone"];
export const closeAddCardAutoWireToasts =
  () => (dispatch: Dispatch, getState: GetState) => {
    const undos = getState().undo;

    for (const undo of undos) {
      if (undo.type && autoWireToastTypes.includes(undo.type)) {
        dispatch(dismissUndo({ undoId: undo.id }));
      }
    }
  };
