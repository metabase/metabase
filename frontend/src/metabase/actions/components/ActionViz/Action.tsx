import React, { useMemo, useCallback } from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import { executeRowAction } from "metabase/dashboard/actions";

import type {
  ActionDashboardCard,
  Dashboard,
  ParametersForActionExecution,
  WritebackQueryAction,
} from "metabase-types/api";
import type { VisualizationProps } from "metabase-types/types/Visualization";
import type { Dispatch } from "metabase-types/store";
import type { ParameterValueOrArray } from "metabase-types/types/Parameter";

import { generateFieldSettingsFromParameters } from "../../utils";
import {
  getDashcardParamValues,
  getNotProvidedActionParameters,
  shouldShowConfirmation,
  setNumericValues,
} from "./utils";
import LinkButton from "./LinkButton";
import ActionVizForm from "./ActionVizForm";
import { ActionParameterOptions } from "./ActionOptions";
import { StyledButton } from "./ActionButton.styled";

interface ActionProps extends VisualizationProps {
  dashcard: ActionDashboardCard;
  dashboard: Dashboard;
  dispatch: Dispatch;
  parameterValues: { [id: string]: ParameterValueOrArray };
}

function ActionComponent({
  dashcard,
  dashboard,
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
        ...setNumericValues(
          dashcardParamValues,
          generateFieldSettingsFromParameters(
            dashcard?.action?.parameters ?? [],
          ),
        ),
        ...parameterMap,
      };

      return executeRowAction({
        dashboard,
        dashcard,
        parameters: params,
        dispatch,
        shouldToast: shouldDisplayButton,
      });
    },
    [dashboard, dashcard, dashcardParamValues, dispatch, shouldDisplayButton],
  );

  const showParameterMapper = isEditing && !isSettings;

  if (dashcard.action) {
    return (
      <>
        {showParameterMapper && (
          <ActionParameterOptions dashcard={dashcard} dashboard={dashboard} />
        )}
        <ActionVizForm
          onSubmit={onSubmit}
          dashcard={dashcard}
          dashboard={dashboard}
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
