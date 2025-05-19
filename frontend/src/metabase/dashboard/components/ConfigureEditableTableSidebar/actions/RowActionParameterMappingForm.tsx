import { useMemo } from "react";
import { t } from "ttag";

import {
  isParameterHidden,
  isParameterRequired,
} from "metabase/actions/components/ActionViz/utils";
import EmptyState from "metabase/components/EmptyState";
import {
  Form,
  FormRadioGroup,
  FormSelect,
  FormTextInput,
} from "metabase/forms";
import { Box, Group, Radio, Stack, Text } from "metabase/ui";
import type {
  Field,
  RowActionFieldSettings,
  WritebackAction,
  WritebackParameter,
} from "metabase-types/api";

import S from "./RowActionSettingsModalContent.module.css";
import { TableColumnsSelect } from "./TableColumnsSelect";
import { getDefaultSourceTypeOptions, getFieldFlagsCaption } from "./utils";

interface ActionParameterMappingProps {
  action: WritebackAction;
  parameters: WritebackParameter[];
  values: { parameters: RowActionFieldSettings[] };
  tableColumns: Field[];
}

export const RowActionParameterMappingForm = ({
  action,
  parameters,
  values,
  tableColumns,
}: ActionParameterMappingProps) => {
  const typeFieldOptions = useMemo(() => getDefaultSourceTypeOptions(), []);

  return (
    <Form role="form" data-testid="row-actions-parameters-mapping-form">
      <Stack gap="lg" mt="md">
        {parameters.map((actionParameter: WritebackParameter, index) => {
          const isRequired = isParameterRequired(action, actionParameter);
          const isHidden = isParameterHidden(action, actionParameter);
          const name = actionParameter.name ?? actionParameter.id;

          return (
            <Box
              key={actionParameter.id}
              className={S.ParameterWidget}
              data-testid={`parameter-form-section-${actionParameter.id}`}
            >
              <Text>
                {`${name}: ${getFieldFlagsCaption({ isRequired, isHidden })}`}
              </Text>
              <FormSelect
                name={`parameters.${index}.sourceType`}
                data={typeFieldOptions}
              />
              {values.parameters[index]?.sourceType === "row-data" && (
                <Box mt="1rem">
                  {/* TODO: use tuple notaion for field id */}
                  <TableColumnsSelect
                    name={`parameters.${index}.sourceValueTarget`}
                    columns={tableColumns}
                  />
                </Box>
              )}

              {values.parameters[index]?.sourceType === "constant" && (
                <Box mt="1rem">
                  <FormTextInput
                    label={t`Value`}
                    name={`parameters.${index}.value`}
                  />
                </Box>
              )}

              {values.parameters[index]?.sourceType !== "ask-user" && (
                <Group mt="1rem">
                  <FormRadioGroup name={`parameters.${index}.visibility`}>
                    <Group>
                      <Radio
                        name={`parameters.${index}.visibility`}
                        label={t`Visible`}
                        value=""
                      />
                      <Radio
                        name={`parameters.${index}.visibility`}
                        label={t`Read-only`}
                        value="readonly"
                      />
                      <Radio
                        name={`parameters.${index}.visibility`}
                        label={t`Hidden`}
                        value="hidden"
                      />
                    </Group>
                  </FormRadioGroup>
                </Group>
              )}
            </Box>
          );
        })}

        {parameters.length === 0 && (
          <EmptyState message={t`This action has no parameters to map`} />
        )}
      </Stack>
    </Form>
  );
};
