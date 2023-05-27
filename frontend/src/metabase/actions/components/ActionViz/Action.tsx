import React, { useMemo, useCallback } from "react";
import _ from "underscore";
import { t } from "ttag";
import { connect } from "react-redux";

import Tooltip from "metabase/core/components/Tooltip";
import { getResponseErrorMessage } from "metabase/core/utils/errors";

import Databases from "metabase/entities/databases";

import { executeRowAction } from "metabase/dashboard/actions";
import { getEditingDashcardId } from "metabase/dashboard/selectors";

import type { VisualizationProps } from "metabase/visualizations/types";
import type {
  ActionDashboardCard,
  Dashboard,
  ParametersForActionExecution,
  ParameterValueOrArray,
  WritebackAction,
} from "metabase-types/api";
import type { Dispatch, State } from "metabase-types/store";

import type Database from "metabase-lib/metadata/Database";

import {
  getDashcardParamValues,
  getNotProvidedActionParameters,
  getMappedActionParameters,
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
  error?: unknown;
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

  const mappedParameters = useMemo(() => {
    if (!dashcard.action) {
      return [];
    }
    return getMappedActionParameters(
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
    (parameters: ParametersForActionExecution) =>
      executeRowAction({
        dashboard,
        dashcard,
        parameters,
        dispatch,
        shouldToast: shouldDisplayButton,
      }),
    [dashboard, dashcard, dispatch, shouldDisplayButton],
  );

  return (
    <ActionVizForm
      action={dashcard.action as WritebackAction}
      dashboard={dashboard}
      dashcard={dashcard}
      missingParameters={missingParameters}
      mappedParameters={mappedParameters}
      dashcardParamValues={dashcardParamValues}
      settings={settings}
      isSettings={isSettings}
      shouldDisplayButton={shouldDisplayButton}
      isEditingDashcard={isEditingDashcard}
      onSubmit={onSubmit}
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
  error?: unknown;
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Databases.load({
    id: (state: State, props: ActionProps) =>
      props.dashcard?.action?.database_id,
    loadingAndErrorWrapper: false,
  }),
  connect(mapStateToProps),
)(ActionFn);
