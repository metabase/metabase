import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import type { ActionItem } from "metabase/common/components/DataPicker";
import EditableText from "metabase/common/components/EditableText";
import EmptyState from "metabase/common/components/EmptyState";
import { Form, FormProvider } from "metabase/forms";
import { Box, Button, Center, Loader, Stack, Title } from "metabase/ui";
import type { BasicTableViewColumn } from "metabase/visualizations/types/table-actions";
import { useGetFormConfigurationMutation } from "metabase-enterprise/api";
import type {
  ActionScope,
  RowActionFieldSettings,
  TableActionDisplaySettings,
} from "metabase-types/api";

import { ActionParameterSettingsItem } from "./ActionParameterSettingsItem";
import S from "./AddOrEditActionSettingsContent.module.css";
import type { ActionParametersFormValues } from "./types";
import { cleanEmptyVisibility, isValidMapping } from "./utils";

interface ActionParameterMappingProps {
  action: ActionItem;
  actionSettings: TableActionDisplaySettings | null | undefined;
  actionScope: ActionScope;
  tableColumns: BasicTableViewColumn[];
  onSubmit: (actionParams: {
    id?: string;
    action: ActionItem;
    name: string | undefined;
    parameterMappings: RowActionFieldSettings[];
  }) => void;
}

export const ActionParameterMappingForm = ({
  action,
  actionSettings,
  actionScope,
  tableColumns,
  onSubmit,
}: ActionParameterMappingProps) => {
  const [actionName, setActionName] = useState<string | undefined>(
    actionSettings?.name || action.name,
  );

  const [fetchFormConfiguration, { data: formConfiguration }] =
    useGetFormConfigurationMutation();

  useEffect(() => {
    // Pass ActionExpression as ID if actionSettings.id is not provided
    const actionId = actionSettings?.id
      ? actionSettings.id
      : {
          "action-id": action.id,
          name: action.name,
          parameters: [],
        };

    fetchFormConfiguration({
      action_id: actionId,
      scope: actionScope,
    });
  }, [fetchFormConfiguration, actionSettings, action, actionScope]);

  const initialValues = useMemo(() => {
    if (!formConfiguration) {
      return {
        parameters: [],
      };
    }

    return {
      parameters: formConfiguration.parameters.map(
        ({ id, sourceType, sourceValueTarget, visibility, value }) => {
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
            sourceType,
            visibility,
            sourceValueTarget,
            value,
          } as RowActionFieldSettings;
        },
      ),
    };
  }, [actionSettings, formConfiguration]);

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

  if (!formConfiguration) {
    return (
      <Box className={S.ParametersModalRightSection} p="xl">
        <Center>
          <Loader />
        </Center>
      </Box>
    );
  }

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

            {formConfiguration.parameters.length > 0 && (
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
                  {formConfiguration.parameters.map(
                    (actionParameter, index) => (
                      <ActionParameterSettingsItem
                        key={actionParameter.id}
                        index={index}
                        actionParameter={actionParameter}
                        tableColumns={tableColumns}
                      />
                    ),
                  )}

                  {formConfiguration.parameters.length === 0 && (
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
