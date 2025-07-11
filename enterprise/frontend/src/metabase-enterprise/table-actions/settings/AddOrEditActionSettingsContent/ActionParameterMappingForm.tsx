import { useMemo, useState } from "react";
import { t } from "ttag";

import { sortActionParams } from "metabase/actions/utils";
import EditableText from "metabase/common/components/EditableText";
import EmptyState from "metabase/common/components/EmptyState";
import { Form, FormProvider } from "metabase/forms";
import { Box, Button, Stack, Title } from "metabase/ui";
import type { BasicTableViewColumn } from "metabase/visualizations/types/table-actions";
import type {
  DataGridWritebackAction,
  RowActionFieldSettings,
  TableActionDisplaySettings,
} from "metabase-types/api";

import { ActionParameterSettingsItem } from "./ActionParameterSettingsItem";
import S from "./AddOrEditActionSettingsContent.module.css";
import type { ActionParametersFormValues } from "./types";
import { cleanEmptyVisibility, isValidMapping } from "./utils";

interface ActionParameterMappingProps {
  action: DataGridWritebackAction;
  actionSettings: TableActionDisplaySettings | null | undefined;
  tableColumns: BasicTableViewColumn[];
  onSubmit: (actionParams: {
    id?: string;
    action: DataGridWritebackAction;
    name: string | undefined;
    parameterMappings: RowActionFieldSettings[];
  }) => void;
}

export const ActionParameterMappingForm = ({
  action,
  actionSettings,
  tableColumns,
  onSubmit,
}: ActionParameterMappingProps) => {
  const [actionName, setActionName] = useState<string | undefined>(
    actionSettings?.name || action.name,
  );

  const hasParameters = !!action.parameters?.length;

  const writeableParameters = useMemo(() => {
    const actionParameters = action.parameters ?? [];

    const sorted =
      actionParameters && action.visualization_settings?.fields
        ? actionParameters.toSorted(
            sortActionParams(action.visualization_settings),
          )
        : actionParameters || [];

    if (action.visualization_settings?.fields) {
      return sorted.filter(
        ({ id }) => !action.visualization_settings?.fields?.[id]?.hidden,
      );
    }

    return sorted;
  }, [action]);

  const initialValues = useMemo(() => {
    return {
      parameters: writeableParameters.map(({ id }) => {
        if (actionSettings) {
          const mapping = actionSettings.parameterMappings?.find(
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
  }, [actionSettings, writeableParameters]);

  const getIsFormInvalid = (values: ActionParametersFormValues) => {
    return values.parameters.some(
      (mapping) => !isValidMapping(mapping, tableColumns),
    );
  };

  const handleSubmit = (values: ActionParametersFormValues) => {
    onSubmit({
      id: actionSettings?.id,
      action: action,
      name: actionName,
      parameterMappings: cleanEmptyVisibility(values.parameters || []),
    });
  };

  return (
    <Box className={S.ParametersModalRightSection}>
      <FormProvider<ActionParametersFormValues>
        initialValues={initialValues}
        onSubmit={handleSubmit}
        enableReinitialize
      >
        {({ values }) => (
          <Form className={S.ParametersForm}>
            <Box p="lg">
              <EditableText
                className={S.EditableTitle}
                initialValue={actionName || action.name}
                placeholder={t`Add title`}
                data-testid="row-action-name-heading"
                onChange={setActionName}
              />
            </Box>

            {hasParameters && (
              <Box px="2rem">
                <Title
                  order={4}
                >{t`Where should the values for this row action come from?`}</Title>
              </Box>
            )}
            <Box className={S.ParametersListContainer}>
              <Form
                role="form"
                data-testid="table-action-parameters-mapping-form"
              >
                <Stack gap="lg" mt="md">
                  {writeableParameters.map((actionParameter, index) => (
                    <ActionParameterSettingsItem
                      key={actionParameter.id}
                      index={index}
                      action={action}
                      actionParameter={actionParameter}
                      tableColumns={tableColumns}
                    />
                  ))}

                  {writeableParameters.length === 0 && (
                    <EmptyState
                      message={t`This action has no parameters to map`}
                    />
                  )}
                </Stack>
              </Form>
            </Box>
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
  );
};
