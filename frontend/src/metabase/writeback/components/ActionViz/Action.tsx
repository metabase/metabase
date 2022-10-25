import React, { useMemo, useCallback } from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import type {
  ActionDashboardCard,
  Dashboard,
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
import { StyledButton } from "./ActionButton.styled";

import LinkButton from "./LinkButton";
import ImplicitActionButton from "./ImplicitActionButton";
import ActionForm from "./ActionForm";

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
  settings,
  onVisualizationClick,
  parameterValues,
}: ActionProps) {
  const dashcardSettings = dashcard.visualization_settings;
  const actionSettings = dashcard.action?.visualization_settings;
  const actionDisplayType =
    dashcardSettings?.actionDisplayType ?? actionSettings?.type ?? "button";

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

  const shouldDisplayButton =
    actionDisplayType !== "form" || !missingParameters.length;

  const onSubmit = useCallback(
    (parameterMap: ParametersForActionExecution) =>
      executeRowAction({
        dashboard,
        dashcard,
        parameters: {
          ...dashcardParamValues,
          ...parameterMap,
        },
        dispatch,
        shouldToast: shouldDisplayButton,
      }),
    [dashboard, dashcard, dashcardParamValues, dispatch, shouldDisplayButton],
  );

  if (dashcard.action) {
    return (
      <ActionForm
        onSubmit={onSubmit}
        dashcard={dashcard}
        missingParameters={missingParameters}
        action={dashcard.action as WritebackQueryAction}
        shouldDisplayButton={shouldDisplayButton}
      />
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
