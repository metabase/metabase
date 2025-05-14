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
import { ExplainerText } from "metabase/actions/components/ActionViz/ExplainerText";
import { ConnectedActionPicker } from "metabase/actions/containers/ActionPicker";
import EmptyState from "metabase/components/EmptyState";
import CS from "metabase/css/core/index.css";
import { Box, Button, TextInput } from "metabase/ui";
import type {
  EditableTableRowActionDisplaySettings,
  Field,
  RowActionFieldFieldSettingsMap,
  RowActionFieldSettings,
  WritebackAction,
} from "metabase-types/api";

import { RowActionParameterMappingForm } from "./RowActionParameterMappingForm";

interface Props {
  action: WritebackAction | null | undefined;
  rowActionSettings: EditableTableRowActionDisplaySettings | undefined;
  tableColumns: Field[];
  onClose: () => void;
  onSubmit: (actionParams: {
    action: WritebackAction;
    name: string | undefined;
    parameterMappings: RowActionFieldSettings[];
  }) => void;
}

export function RowActionSettingsModalContent({
  action: editedAction,
  rowActionSettings,
  tableColumns,
  onClose,
  onSubmit,
}: Props) {
  const [selectedAction, setSelectedAction] = useState<WritebackAction | null>(
    editedAction || null,
  );

  const isEditMode = !!editedAction;

  const [actionName, setActionName] = useState<string | undefined>(
    rowActionSettings?.name || selectedAction?.name,
  );

  const [parameterMappings, setParameterMappings] = useState(
    rowActionSettings?.parameterMappings,
  );

  const hasParameters = !!selectedAction?.parameters?.length;

  const currentMappingsMap = useMemo(
    () =>
      Object.fromEntries(
        parameterMappings?.map((mapping) => [mapping.parameterId, mapping]) ??
          [],
      ),
    [parameterMappings],
  );

  // TODO: add validation rules
  // const isFormInvalid =
  //   selectedAction != null &&
  //   selectedAction.parameters?.some((actionParameter) => {
  //     const isHidden = isParameterHidden(selectedAction, actionParameter);
  //     const isRequired = isParameterRequired(selectedAction, actionParameter);
  //
  //     const isParameterMapped =
  //       currentMappingsMap[actionParameter.id] != null;
  //
  //     const defaultValue = getParameterDefaultValue(
  //       selectedAction,
  //       actionParameter,
  //     );
  //     const hasDefaultValue = defaultValue != null;
  //
  //     return isHidden && isRequired && !isParameterMapped && !hasDefaultValue;
  //   });

  const handlePickAction = (action: WritebackAction) => {
    setSelectedAction(action);
  };

  const handleMappingsChange = (
    mappingsMap: RowActionFieldFieldSettingsMap,
  ) => {
    setParameterMappings(Object.values(mappingsMap));
  };

  const handleSubmit = useCallback(() => {
    if (selectedAction) {
      onSubmit({
        action: selectedAction,
        name: actionName,
        parameterMappings: parameterMappings || [],
      });
    }

    onClose();
  }, [selectedAction, onClose, onSubmit, actionName, parameterMappings]);

  return (
    <ActionSettingsWrapper
      style={{
        minWidth: isEditMode ? "auto" : undefined,
      }}
    >
      {!isEditMode && (
        <ActionSettingsLeft>
          <h4 className={CS.pb2}>{t`Action Library`}</h4>
          <ConnectedActionPicker
            currentAction={selectedAction}
            onClick={handlePickAction}
          />
        </ActionSettingsLeft>
      )}
      <ActionSettingsRight>
        {selectedAction ? (
          <>
            <Box p="md">
              <TextInput
                label={t`Row action name`}
                value={actionName || selectedAction.name}
                onChange={(e) => setActionName(e.target.value)}
              />
            </Box>

            {hasParameters && (
              <>
                <ActionSettingsHeader>
                  {t`Where should the values for '${selectedAction.name}' row action come from?`}
                </ActionSettingsHeader>
                <ExplainerText />
              </>
            )}
            <ParameterMapperContainer>
              <RowActionParameterMappingForm
                action={selectedAction}
                currentMappingsMap={currentMappingsMap}
                tableColumns={tableColumns}
                onMappingsChange={handleMappingsChange}
              />
            </ParameterMapperContainer>
          </>
        ) : (
          <ParameterMapperContainer>
            <EmptyActionState />
          </ParameterMapperContainer>
        )}
        <ModalActions>
          <Button variant="filled" onClick={handleSubmit}>
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
