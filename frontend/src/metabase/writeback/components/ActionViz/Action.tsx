import React, { useMemo, useCallback } from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import { isImplicitActionButton } from "metabase/writeback/utils";

import type {
  ActionDashboardCard,
  ArbitraryParameterForActionExecution,
  ActionParametersMapping,
  Dashboard,
  ParameterMappedForActionExecution,
  WritebackQueryAction,
} from "metabase-types/api";
import type { VisualizationProps } from "metabase-types/types/Visualization";
import type { Dispatch } from "metabase-types/store";
import type { ParameterValueOrArray } from "metabase-types/types/Parameter";

import {
  getDashcardParamValues,
  getNotProvidedActionParameters,
  prepareParameter,
} from "metabase/modes/components/drill/ActionClickDrill/utils";
import { executeRowAction } from "metabase/dashboard/actions";
import { StyledButton } from "./ActionButton.styled";

import DefaultActionButton from "./DefaultActionButton";
import ImplicitActionButton from "./ImplicitActionButton";

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
  getExtraDataForClick,
  onVisualizationClick,
  parameterValues,
}: ActionProps) {
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

  const onSubmit = useCallback(
    (extra_parameters: ArbitraryParameterForActionExecution[]) =>
      executeRowAction({
        dashboard,
        dashcard,
        parameters: dashcardParamValues,
        extra_parameters,
        dispatch,
        shouldToast: true,
      }),
    [dashboard, dashcard, dashcardParamValues, dispatch],
  );

  if (isImplicitActionButton(dashcard)) {
    return <ImplicitActionButton isSettings={isSettings} settings={settings} />;
  }

  return (
    <DefaultActionButton
      onSubmit={onSubmit}
      missingParameters={missingParameters}
      isSettings={isSettings}
      settings={settings}
      getExtraDataForClick={getExtraDataForClick}
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
