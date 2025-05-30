import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { ActionSettingsWrapper } from "metabase/actions/components/ActionViz/ActionDashcardSettings.styled";
import {
  ModelActionPicker,
  TableActionPicker,
} from "metabase/actions/containers/ActionPicker/ActionPicker";
import { sortActionParams } from "metabase/actions/utils";
import { skipToken, useGetCardQuery } from "metabase/api";
import EmptyState from "metabase/components/EmptyState";
import EditableText from "metabase/core/components/EditableText/EditableText";
import CS from "metabase/css/core/index.css";
import { Form, FormProvider } from "metabase/forms";
import { Box, Button, Title } from "metabase/ui";
import type { BasicTableViewColumn } from "metabase/visualizations/types/table-actions";
import { useGetActionsQuery } from "metabase-enterprise/api";
import type {
  RowActionFieldSettings,
  TableAction,
  TableActionDisplaySettings,
  WritebackAction,
  WritebackParameter,
} from "metabase-types/api";

import {
  type TableActionTargetEntity,
  TableOrModelDataPicker,
} from "../TableActionPicker/TableOrModelDataPicker";

import { RowActionParameterMappingForm } from "./RowActionParameterMappingForm";
import S from "./RowActionSettingsModalContent.module.css";
import { cleanEmptyVisibility, isValidMapping } from "./utils";

interface Props {
  action: TableActionDisplaySettings | null | undefined;
  tableColumns: BasicTableViewColumn[];
  onClose: () => void;
  onSubmit: (actionParams: {
    id?: string;
    action: WritebackAction | TableAction;
    name: string | undefined;
    parameterMappings: RowActionFieldSettings[];
  }) => void;
  actions?: (WritebackAction | TableAction)[];
}

export function RowActionSettingsModalContent({
  action: editedActionSettings,
  tableColumns,
  onClose,
  onSubmit,
}: Props) {
  const [selectedAction, setSelectedAction] = useState<
    WritebackAction | TableAction | undefined
  >(undefined);

  const [formStep, setFormStep] = useState<"entity" | "action">(
    editedActionSettings ? "action" : "entity",
  );

  const [actionTarget, setActionTarget] =
    useState<TableActionTargetEntity | null>(null);

  const { data: allActions } = useGetActionsQuery(
    actionTarget ? skipToken : undefined,
  );
  const { data: model } = useGetCardQuery(
    actionTarget?.model !== "dataset" ? skipToken : { id: actionTarget.id },
  );

  const actions = useMemo(
    () =>
      allActions?.filter((action) => {
        if (actionTarget?.model === "dataset") {
          return (action as WritebackAction).model_id === actionTarget.id;
        }
        if (actionTarget?.model === "table") {
          return (action as TableAction).table_id === actionTarget.id;
        }
      }) || [],
    [actionTarget, allActions],
  );

  const isEditMode = !!editedActionSettings;

  const [actionName, setActionName] = useState<string | undefined>(
    selectedAction?.name,
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
          const mapping = editedActionSettings.parameterMappings?.find(
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
  }, [
    isEditMode,
    editedActionSettings?.parameterMappings,
    writeableParameters,
  ]);

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

  const handleEntitySelect = (entity: TableActionTargetEntity) => {
    setActionTarget(entity);
    setFormStep("action");
  };

  const handleActionFormBack = () => {
    setFormStep("entity");
    setSelectedAction(undefined);
  };

  const handleSubmit = useCallback(
    (values: { parameters: RowActionFieldSettings[] }) => {
      if (selectedAction) {
        onSubmit({
          id: editedActionSettings?.id,
          action: selectedAction,
          name: actionName,
          parameterMappings: cleanEmptyVisibility(values.parameters || []),
        });
      }

      onClose();
    },
    [selectedAction, onClose, onSubmit, editedActionSettings?.id, actionName],
  );

  if (formStep === "entity") {
    return (
      <TableOrModelDataPicker
        value={actionTarget}
        onChange={handleEntitySelect}
        onClose={onClose}
      />
    );
  }

  return (
    <ActionSettingsWrapper
      style={{
        padding: 0,
        height: "78vh",
        minWidth: isEditMode ? "auto" : undefined,
      }}
    >
      {!isEditMode && (
        <Box className={S.ParametersModalModalLeftSection}>
          <Button onClick={handleActionFormBack}>{t`Back`}</Button>
          <Title order={3} className={CS.pb2}>{t`Action Library`}</Title>
          {actionTarget.model === "table" && (
            <TableActionPicker
              key={actionTarget.id}
              title={actionTarget.name}
              actions={actions as TableAction[]}
              onClick={setSelectedAction}
              currentAction={selectedAction as TableAction | undefined}
            />
          )}
          {actionTarget.model === "dataset" && model && (
            <ModelActionPicker
              key={actionTarget.id}
              model={model}
              actions={actions as WritebackAction[]}
              onClick={setSelectedAction}
              currentAction={selectedAction as WritebackAction | undefined}
            />
          )}
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
                      // TODO: Fix later when new table actions API is ready
                      action={selectedAction as unknown as WritebackAction}
                      parameters={
                        writeableParameters as unknown as WritebackParameter[]
                      }
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
