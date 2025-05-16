import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import {
  ActionSettingsLeft,
  ActionSettingsRight,
  ActionSettingsWrapper,
  ModalActions,
  ParameterMapperContainer,
} from "metabase/actions/components/ActionViz/ActionDashcardSettings.styled";
import { ConnectedActionPicker } from "metabase/actions/containers/ActionPicker";
import EmptyState from "metabase/components/EmptyState";
import EditableText from "metabase/core/components/EditableText/EditableText";
import CS from "metabase/css/core/index.css";
import { Box, Button, Title } from "metabase/ui";
import type {
  EditableTableRowActionDisplaySettings,
  Field,
  ParameterId,
  PartialRowActionFieldSettings,
  RowActionFieldSettings,
  WritebackAction,
} from "metabase-types/api";

import S from "./ConfigureEditableTableActions.module.css";
import { RowActionParameterMappingForm } from "./RowActionParameterMappingForm";
import { isValidMapping } from "./utils";

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

  const [parameterMappings, setParameterMappings] = useState<
    PartialRowActionFieldSettings[] | undefined
  >(rowActionSettings?.parameterMappings);

  const hasParameters = !!selectedAction?.parameters?.length;

  const currentMappingsMap = useMemo(
    () =>
      Object.fromEntries(
        parameterMappings?.map((mapping) => [mapping.parameterId, mapping]) ??
          [],
      ),
    [parameterMappings],
  );

  const isFormInvalid =
    selectedAction != null &&
    parameterMappings?.some((mapping) => !isValidMapping(mapping));

  const handlePickAction = (action: WritebackAction) => {
    setSelectedAction(action);
  };

  const handleMappingsChange = (
    mappingsMap: Record<ParameterId, PartialRowActionFieldSettings>,
  ) => {
    setParameterMappings(Object.values(mappingsMap));
  };

  const handleSubmit = useCallback(() => {
    if (selectedAction) {
      onSubmit({
        action: selectedAction,
        name: actionName,
        parameterMappings:
          (parameterMappings as RowActionFieldSettings[]) || [], // checked via "isFormInvalid"
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
      <ActionSettingsRight style={{ padding: 0 }}>
        {selectedAction ? (
          <>
            <Box pl="lg">
              <EditableText
                className={S.EditableTitle}
                initialValue={actionName || selectedAction.name}
                placeholder={t`Add title`}
                data-testid="row-action-name-heading"
                onChange={setActionName}
              />
            </Box>

            {hasParameters && (
              <Box p="1rem 2rem 0">
                <Title
                  order={4}
                >{t`Where should the values for this row action come from?`}</Title>
              </Box>
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
          <Button
            variant="filled"
            onClick={handleSubmit}
            disabled={isFormInvalid}
          >
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
