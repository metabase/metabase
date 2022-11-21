import React, { useMemo, useCallback } from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import type {
  ActionDashboardCard,
  DataAppPage,
  ParametersForActionExecution,
  WritebackQueryAction,
} from "metabase-types/api";
import type { VisualizationProps } from "metabase-types/types/Visualization";
import type { Dispatch } from "metabase-types/store";
import type { ParameterValueOrArray } from "metabase-types/types/Parameter";

import {
  getDashcardParamValues,
  getNotProvidedActionParameters,
} from "metabase/modes/components/drill/ActionClickDrill/utils";
import { executeRowAction } from "metabase/dashboard/actions";
import { setNumericValues } from "metabase/writeback/containers/ActionParametersInputForm/utils";
import { generateFieldSettingsFromParameters } from "../ActionCreator/FormCreator";
import { StyledButton } from "./ActionButton.styled";

import LinkButton from "./LinkButton";
import ActionForm from "./ActionForm";

import { shouldShowConfirmation } from "./utils";
import { ActionParameterMapper } from "./ActionParameterMapper";

interface ActionProps extends VisualizationProps {
  dashcard: ActionDashboardCard;
  dashboard: DataAppPage;
  dispatch: Dispatch;
  parameterValues: { [id: string]: ParameterValueOrArray };
}

function ActionComponent({
  dashcard,
  dashboard: page,
  dispatch,
  isSettings,
  isEditing,
  settings,
  onVisualizationClick,
  parameterValues,
}: ActionProps) {
  const actionSettings = dashcard.action?.visualization_settings;
  const actionDisplayType =
    settings?.actionDisplayType ?? actionSettings?.type ?? "button";

  const dashcardParamValues = useMemo(
    () => getDashcardParamValues(dashcard, parameterValues),
    [dashcard, parameterValues],
  );

  const missingParameters = useMemo(() => {
    if (!dashcard.action) {
      return [];
    }
    return getNotProvidedActionParameters(
      dashcard.action,
      dashcardParamValues ?? [],
    );
  }, [dashcard, dashcardParamValues]);

  const shouldConfirm = shouldShowConfirmation(dashcard?.action);

  const shouldDisplayButton = !!(
    actionDisplayType !== "form" ||
    !missingParameters.length ||
    shouldConfirm
  );

  const onSubmit = useCallback(
    (parameterMap: ParametersForActionExecution) => {
      const params = {
        ...dashcardParamValues,
        ...parameterMap,
      };

      const paramsForExecution = setNumericValues(
        params,
        generateFieldSettingsFromParameters(dashcard?.action?.parameters ?? []),
      );

      return executeRowAction({
        page,
        dashcard,
        parameters: paramsForExecution,
        dispatch,
        shouldToast: shouldDisplayButton,
      });
    },
    [page, dashcard, dashcardParamValues, dispatch, shouldDisplayButton],
  );

  const showParameterMapper = isEditing && !isSettings;

  if (dashcard.action) {
    return (
      <>
        {showParameterMapper && (
          <ActionParameterMapper dashcard={dashcard} page={page} />
        )}
        <ActionForm
          onSubmit={onSubmit}
          dashcard={dashcard}
          page={page}
          settings={settings}
          isSettings={isSettings}
          missingParameters={missingParameters}
          dashcardParamValues={dashcardParamValues}
          action={dashcard.action as WritebackQueryAction}
          shouldDisplayButton={shouldDisplayButton}
        />
      </>
    );
  }

  return (
    <LinkButton
      isSettings={isSettings}
      settings={settings}
      onVisualizationClick={onVisualizationClick}
    />
  );
}

const ConnectedActionComponent = connect()(ActionComponent);

export default function Action(props: ActionProps) {
  if (
    !props.dashcard?.action &&
    !props.dashcard?.visualization_settings?.click_behavior
  ) {
    return (
      <StyledButton>
        <strong>{t`Assign an action`}</strong>
      </StyledButton>
    );
  }

  return <ConnectedActionComponent {...props} />;
}
