import React, { useMemo, useCallback } from "react";
import _ from "underscore";
import { t } from "ttag";
import { connect } from "react-redux";

import { executeRowAction } from "metabase/dashboard/actions";

import Tooltip from "metabase/core/components/Tooltip";

import {
  getResponseErrorMessage,
  GenericErrorResponse,
} from "metabase/core/utils/errors";

import type {
  ActionDashboardCard,
  ParametersForActionExecution,
  WritebackQueryAction,
  Dashboard,
} from "metabase-types/api";

import type { VisualizationProps } from "metabase-types/types/Visualization";
import type { Dispatch, State } from "metabase-types/store";
import type { ParameterValueOrArray } from "metabase-types/types/Parameter";

import {
  generateFieldSettingsFromParameters,
  setNumericValues,
} from "metabase/actions/utils";

import { getEditingDashcardId } from "metabase/dashboard/selectors";
import Databases from "metabase/entities/databases";

import type Database from "metabase-lib/metadata/Database";

import {
  getDashcardParamValues,
  getNotProvidedActionParameters,
  shouldShowConfirmation,
} from "./utils";
import ActionVizForm from "./ActionVizForm";
import ActionButtonView from "./ActionButtonView";
import { FullContainer } from "./ActionButton.styled";

interface OwnProps {
  dashcard: ActionDashboardCard;
  dashboard: Dashboard;
  parameterValues: { [id: string]: ParameterValueOrArray };
  isEditingDashcard: boolean;
  dispatch: Dispatch;
}

interface DatabaseLoaderProps {
  database: Database;
  error?: GenericErrorResponse;
}

export type ActionProps = VisualizationProps & OwnProps & DatabaseLoaderProps;

function ActionComponent({
  dashcard,
  dashboard,
  dispatch,
  isSettings,
  settings,
  parameterValues,
  isEditingDashcard,
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
      const action = dashcard.action;
      const fieldSettings =
        action?.visualization_settings?.fields ||
        generateFieldSettingsFromParameters(action?.parameters ?? []);

      const params = setNumericValues(
        { ...dashcardParamValues, ...parameterMap },
        fieldSettings,
      );

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

  return (
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
      isEditingDashcard={isEditingDashcard}
    />
  );
}

const ConnectedActionComponent = connect()(ActionComponent);

function mapStateToProps(state: State, props: ActionProps) {
  return {
    isEditingDashcard: getEditingDashcardId(state) === props.dashcard.id,
  };
}

function ActionFn(props: ActionProps) {
  const {
    database,
    dashcard: { action },
    error,
  } = props;

  const hasActionsEnabled = database?.hasActionsEnabled?.();

  if (error || !action || !hasActionsEnabled) {
    const tooltip = getErrorTooltip({
      hasActionAssigned: !!action,
      hasActionsEnabled,
      error,
    });

    return (
      <Tooltip tooltip={tooltip}>
        <FullContainer>
          <ActionButtonView
            disabled
            icon="bolt"
            tooltip={tooltip}
            settings={props.settings}
            focus={props.isEditingDashcard}
          />
        </FullContainer>
      </Tooltip>
    );
  }

  return <ConnectedActionComponent {...props} />;
}

function getErrorTooltip({
  hasActionAssigned,
  hasActionsEnabled,
  error,
}: {
  hasActionAssigned: boolean;
  hasActionsEnabled: boolean;
  error?: GenericErrorResponse;
}) {
  if (error) {
    return getResponseErrorMessage(error);
  }
  if (!hasActionAssigned) {
    return t`No action assigned`;
  }
  if (!hasActionsEnabled) {
    return t`Actions are not enabled for this database`;
  }
  return t`Something's gone wrong`;
}

export default _.compose(
  Databases.load({
    id: (state: State, props: ActionProps) =>
      props.dashcard?.action?.database_id,
    loadingAndErrorWrapper: false,
  }),
  connect(mapStateToProps),
)(ActionFn);
