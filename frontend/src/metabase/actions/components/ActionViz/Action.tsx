import React, { useMemo, useCallback } from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import { executeRowAction } from "metabase/dashboard/actions";

import type {
  ActionDashboardCard,
  ParametersForActionExecution,
  WritebackQueryAction,
  Dashboard,
} from "metabase-types/api";
import type { VisualizationProps } from "metabase-types/types/Visualization";
import type { Dispatch, State } from "metabase-types/store";
import type { ParameterValueOrArray } from "metabase-types/types/Parameter";

import { generateFieldSettingsFromParameters } from "metabase/actions/utils";

import { getEditingDashcardId } from "metabase/dashboard/selectors";
import { getMetadata } from "metabase/selectors/metadata";
import type Metadata from "metabase-lib/metadata/Metadata";

import {
  getDashcardParamValues,
  getNotProvidedActionParameters,
  shouldShowConfirmation,
  setNumericValues,
} from "./utils";
import ActionVizForm from "./ActionVizForm";
import ActionButtonView from "./ActionButtonView";

export interface ActionProps extends VisualizationProps {
  dashcard: ActionDashboardCard;
  dashboard: Dashboard;
  dispatch: Dispatch;
  parameterValues: { [id: string]: ParameterValueOrArray };
  isEditingDashcard: boolean;
  metadata: Metadata;
}

export function ActionComponent({
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
    metadata: getMetadata(state),
  };
}

export function ActionFn(props: ActionProps) {
  const {
    metadata,
    dashcard: { action },
  } = props;
  const actionsEnabled = !!metadata
    ?.database(action?.database_id)
    ?.hasActionsEnabled?.();

  if (!props.dashcard?.action || !actionsEnabled) {
    const tooltip = !action
      ? t`No action assigned`
      : t`Actions are not enabled for this database`;

    return (
      <ActionButtonView
        disabled
        icon="bolt"
        tooltip={tooltip}
        settings={props.settings}
        focus={props.isEditingDashcard}
      />
    );
  }

  return <ConnectedActionComponent {...props} />;
}

export default connect(mapStateToProps)(ActionFn);
