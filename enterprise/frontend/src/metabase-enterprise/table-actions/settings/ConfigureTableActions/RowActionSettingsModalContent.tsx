import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { ActionSettingsWrapper } from "metabase/actions/components/ActionViz/ActionDashcardSettings.styled";
import { ConnectedActionPicker } from "metabase/actions/containers/ActionPicker";
import { sortActionParams } from "metabase/actions/utils";
import EmptyState from "metabase/components/EmptyState";
import EditableText from "metabase/core/components/EditableText/EditableText";
import CS from "metabase/css/core/index.css";
import { Form, FormProvider } from "metabase/forms";
import { Box, Button, Title } from "metabase/ui";
import type { BasicTableViewColumn } from "metabase/visualizations/types/table-actions";
import type {
  RowActionFieldSettings,
  TableActionDisplaySettings,
  WritebackAction,
} from "metabase-types/api";

import { RowActionParameterMappingForm } from "./RowActionParameterMappingForm";
import S from "./RowActionSettingsModalContent.module.css";
import { cleanEmptyVisibility, isValidMapping } from "./utils";

interface Props {
  action: WritebackAction | null | undefined;
  rowActionSettings: TableActionDisplaySettings | undefined;
  tableColumns: BasicTableViewColumn[];
  onClose: () => void;
  onSubmit: (actionParams: {
    id?: string;
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

  const hasParameters = !!selectedAction?.parameters?.length;

  const writeableParameters = useMemo(() => {
    const actionParameters = selectedAction?.parameters ?? [];

    const sorted =
      actionParameters && selectedAction?.visualization_settings?.fields
        ? actionParameters.toSorted(
            sortActionParams(selectedAction?.visualization_settings),
          )
        : actionParameters || [];

    if (selectedAction?.visualization_settings?.fields) {
      return sorted.filter(
        ({ id }) =>
          !selectedAction?.visualization_settings?.fields?.[id]?.hidden,
      );
    }

    return sorted;
  }, [selectedAction]);

  const initialValues = useMemo(() => {
    return {
      parameters: writeableParameters.map(({ id }) => {
        if (isEditMode) {
          const mapping = rowActionSettings?.parameterMappings?.find(
            ({ parameterId }) => id === parameterId,
          );
          if (mapping) {
            return mapping;
          }
        }

        return {
          parameterId: id,
          sourceType: "ask-user",
        } as RowActionFieldSettings;
      }),
    };
  }, [isEditMode, rowActionSettings?.parameterMappings, writeableParameters]);

  const getIsFormInvalid = (values: {
    parameters: RowActionFieldSettings[];
  }) => {
    return (
      selectedAction != null &&
      values.parameters.some(
        (mapping) => !isValidMapping(mapping, tableColumns),
      )
    );
  };

  const handlePickAction = (action: WritebackAction) => {
    setSelectedAction(action);
  };

  const handleSubmit = useCallback(
    (values: { parameters: RowActionFieldSettings[] }) => {
      if (selectedAction) {
        onSubmit({
          id: rowActionSettings?.id,
          action: selectedAction,
          name: actionName,
          parameterMappings: cleanEmptyVisibility(values.parameters || []),
        });
      }

      onClose();
    },
    [selectedAction, onClose, onSubmit, rowActionSettings?.id, actionName],
  );

  return (
    <ActionSettingsWrapper
      style={{
        height: "78vh",
        minWidth: isEditMode ? "auto" : undefined,
      }}
    >
      {!isEditMode && (
        <Box className={S.ParametersModalModalLeftSection}>
          <h4 className={CS.pb2}>{t`Action Library`}</h4>
          <ConnectedActionPicker
            currentAction={selectedAction}
            onClick={handlePickAction}
          />
        </Box>
      )}
      <Box className={S.ParametersModalRightSection}>
        <FormProvider
          initialValues={initialValues}
          onSubmit={handleSubmit}
          enableReinitialize
        >
          {({ values }) => (
            <Form className={S.ParametersForm}>
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
                  <Box className={S.ParametersListContainer}>
                    <RowActionParameterMappingForm
                      action={selectedAction}
                      parameters={writeableParameters}
                      values={values}
                      tableColumns={tableColumns}
                    />
                  </Box>
                </>
              ) : (
                <Box className={S.ParametersListContainer}>
                  <EmptyActionState />
                </Box>
              )}
              <Box className={S.ParametersModalFooter}>
                <Button
                  variant="filled"
                  type="submit"
                  disabled={getIsFormInvalid(values)}
                >
                  {t`Done`}
                </Button>
              </Box>
            </Form>
          )}
        </FormProvider>
      </Box>
    </ActionSettingsWrapper>
  );
}

const EmptyActionState = () => (
  <EmptyState className={CS.p3} message={t`Select an action to get started`} />
);
