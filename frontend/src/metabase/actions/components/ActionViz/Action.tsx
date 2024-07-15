import { useCallback, useMemo } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import { useQuestionQuery } from "metabase/common/hooks";
import Tooltip from "metabase/core/components/Tooltip";
import {
  executeRowAction,
  reloadDashboardCards,
} from "metabase/dashboard/actions";
import {
  getEditingDashcardId,
  getParameterValues,
} from "metabase/dashboard/selectors";
import { getActionIsEnabledInDatabase } from "metabase/dashboard/utils";
import type { VisualizationProps } from "metabase/visualizations/types";
import type {
  ActionDashboardCard,
  Dashboard,
  ParametersForActionExecution,
  ParameterValueOrArray,
  WritebackAction,
} from "metabase-types/api";
import type { Dispatch, State } from "metabase-types/store";

import { FullContainer } from "./ActionButton.styled";
import ActionButtonView from "./ActionButtonView";
import ActionVizForm from "./ActionVizForm";
import {
  getDashcardParamValues,
  getMappedActionParameters,
  getNotProvidedActionParameters,
  shouldShowConfirmation,
} from "./utils";

interface OwnProps {
  dashcard: ActionDashboardCard;
  dashboard: Dashboard;
  parameterValues: { [id: string]: ParameterValueOrArray };
}

interface StateProps {
  isEditingDashcard: boolean;

  dispatch: Dispatch;
}

export type ActionProps = Pick<VisualizationProps, "settings" | "isSettings"> &
  OwnProps &
  StateProps;

const ActionComponent = ({
  dashcard,
  dashboard,
  dispatch,
  isSettings,
  settings,
  parameterValues,
  isEditingDashcard,
}: ActionProps) => {
  const { data: model } = useQuestionQuery({
    id: dashcard.action?.model_id,
  });

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

  const canWrite = model?.canWriteActions();

  const onSubmit = useCallback(
    async (parameters: ParametersForActionExecution) => {
      const result = await executeRowAction({
        dashboard,
        dashcard,
        parameters,
        dispatch,
        shouldToast: shouldDisplayButton,
      });

      if (result.success) {
        dispatch(reloadDashboardCards());
      }

      return result;
    },
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
      canEditAction={canWrite}
      onSubmit={onSubmit}
    />
  );
};

const ConnectedActionComponent = connect()(ActionComponent);

function mapStateToProps(state: State, props: ActionProps) {
  return {
    parameterValues: getParameterValues(state),
    isEditingDashcard: getEditingDashcardId(state) === props.dashcard.id,
  };
}

function ActionFn(props: ActionProps) {
  const { dashcard } = props;
  const { action } = dashcard;

  const hasActionsEnabled = getActionIsEnabledInDatabase(dashcard);

  if (!action || !hasActionsEnabled) {
    const tooltip = getErrorTooltip({
      hasActionAssigned: !!action,
      hasActionsEnabled,
    });

    return (
      <Tooltip tooltip={tooltip}>
        <FullContainer data-testid="action-button-full-container">
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
}: {
  hasActionAssigned: boolean;
  hasActionsEnabled: boolean;
}) {
  if (!hasActionAssigned) {
    return t`No action assigned`;
  }

  if (!hasActionsEnabled) {
    return t`Actions are not enabled for this database`;
  }

  return t`Something’s gone wrong`;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(ActionFn);
