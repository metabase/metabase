import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import {
  ActionSettingsHeader,
  ActionSettingsLeft,
  ActionSettingsRight,
  ActionSettingsWrapper,
  ModalActions,
  ParameterMapperContainer,
} from "metabase/actions/components/ActionViz/ActionDashcardSettings.styled";
import {
  ActionParameterMappingForm,
  getTargetKey,
} from "metabase/actions/components/ActionViz/ActionParameterMapping";
import { ExplainerText } from "metabase/actions/components/ActionViz/ExplainerText";
import {
  getParameterDefaultValue,
  isParameterHidden,
  isParameterRequired,
} from "metabase/actions/components/ActionViz/utils";
import { ConnectedActionPicker } from "metabase/actions/containers/ActionPicker";
import EmptyState from "metabase/components/EmptyState";
import Button from "metabase/core/components/Button";
import CS from "metabase/css/core/index.css";
import type {
  ActionParametersMapping,
  Dashboard,
  DashboardCard,
  WritebackAction,
} from "metabase-types/api";

interface Props {
  dashboard: Dashboard;
  dashcard: DashboardCard;
  action?: WritebackAction | null;
  parameterMappings?: ActionParametersMapping[] | null;
  onClose: () => void;
  onSubmit: (
    action: WritebackAction,
    parameterMappings: ActionParametersMapping[],
  ) => void;
}

export function RowActionSettingsModalContent({
  dashboard,
  dashcard,
  action: editedAction,
  parameterMappings,
  onClose,
  onSubmit,
}: Props) {
  const [selectedAction, setSelectedAction] = useState<WritebackAction | null>(
    editedAction || null,
  );

  const hasParameters = !!selectedAction?.parameters?.length;
  const currentMappings = useMemo(
    () =>
      Object.fromEntries(
        parameterMappings?.map((mapping) => [
          getTargetKey(mapping),
          mapping.parameter_id,
        ]) ?? [],
      ),
    [parameterMappings],
  );

  const isFormInvalid =
    selectedAction != null &&
    selectedAction.parameters?.some((actionParameter) => {
      const isHidden = isParameterHidden(selectedAction, actionParameter);
      const isRequired = isParameterRequired(selectedAction, actionParameter);
      const isParameterMapped =
        currentMappings[getTargetKey(actionParameter)] != null;
      const defaultValue = getParameterDefaultValue(
        selectedAction,
        actionParameter,
      );
      const hasDefaultValue = defaultValue != null;

      return isHidden && isRequired && !isParameterMapped && !hasDefaultValue;
    });

  const handleSubmit = useCallback(() => {
    if (selectedAction) {
      onSubmit(selectedAction, []); // TODO: add real remapping settings
    }

    onClose();
  }, [selectedAction, onClose, onSubmit]);

  return (
    <ActionSettingsWrapper
      style={{
        minWidth: editedAction ? "auto" : undefined,
      }}
    >
      {!editedAction && (
        <ActionSettingsLeft>
          <h4 className={CS.pb2}>{t`Action Library`}</h4>
          <ConnectedActionPicker
            currentAction={selectedAction}
            onClick={setSelectedAction}
          />
        </ActionSettingsLeft>
      )}
      <ActionSettingsRight>
        {selectedAction ? (
          <>
            {hasParameters && (
              <>
                <ActionSettingsHeader>
                  {t`Where should the values for '${selectedAction.name}' come from?`}
                </ActionSettingsHeader>
                <ExplainerText />
              </>
            )}
            <ParameterMapperContainer>
              <ActionParameterMappingForm
                // @ts-expect-error -- create a copy of ActionParameterMappingForm for Row Actions, it should work with our dashcard type
                dashcard={dashcard}
                dashboard={dashboard}
                action={selectedAction}
                currentMappings={currentMappings}
              />
            </ParameterMapperContainer>
          </>
        ) : (
          <ParameterMapperContainer>
            <EmptyActionState />
          </ParameterMapperContainer>
        )}
        <ModalActions>
          <Button primary onClick={handleSubmit} disabled={isFormInvalid}>
            {t`Done`}
          </Button>
        </ModalActions>
      </ActionSettingsRight>
    </ActionSettingsWrapper>
  );
}

const EmptyActionState = () => (
  <EmptyState className={CS.p3} message={t`Select an action to get started`} />
);
