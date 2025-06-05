import { useFormikContext } from "formik";
import { t } from "ttag";

import {
  isParameterHidden,
  isParameterRequired,
} from "metabase/actions/components/ActionViz/utils";
import { FormRadioGroup, FormSelect, FormTextInput } from "metabase/forms";
import { Box, Group, Radio, Text } from "metabase/ui";
import type { BasicTableViewColumn } from "metabase/visualizations/types/table-actions";
import type {
  DataGridWritebackAction,
  RowActionFieldSourceType,
  TableActionParameter,
  WritebackAction,
  WritebackParameter,
} from "metabase-types/api";

import S from "./AddOrEditActionSettingsContent.module.css";
import { TableColumnsSelect } from "./TableColumnsSelect";
import type { ActionParametersFormValues } from "./types";
import { getFieldFlagsCaption } from "./utils";

const SOURCE_TYPE_OPTIONS: {
  label: string;
  value: RowActionFieldSourceType;
}[] = [
  {
    get label() {
      return t`Ask the user`;
    },
    value: "ask-user" as const,
  },
  {
    get label() {
      return t`Get data from a row`;
    },
    value: "row-data" as const,
  },
  {
    get label() {
      return t`Use constant value`;
    },
    value: "constant" as const,
  },
];

export type ActionParameterSettingsItemProps = {
  index: number;
  action: DataGridWritebackAction;
  actionParameter: WritebackParameter | TableActionParameter;
  tableColumns: BasicTableViewColumn[];
};

export const ActionParameterSettingsItem = ({
  index,
  action,
  actionParameter,
  tableColumns,
}: ActionParameterSettingsItemProps) => {
  const { setFieldValue, values } =
    useFormikContext<ActionParametersFormValues>();

  const isRequired = isParameterRequired(
    action as WritebackAction,
    actionParameter as WritebackParameter,
  );
  const isHidden = isParameterHidden(
    action as WritebackAction,
    actionParameter as WritebackParameter,
  );
  const name =
    (actionParameter as WritebackParameter).name ?? actionParameter.id;

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
        data={SOURCE_TYPE_OPTIONS}
        onChange={(newValue) => {
          if (newValue === "ask-user") {
            setFieldValue(`parameters.${index}.visibility`, "");
          }
        }}
      />
      {values.parameters[index]?.sourceType === "row-data" && (
        <Box mt="1rem">
          <TableColumnsSelect
            name={`parameters.${index}.sourceValueTarget`}
            columns={tableColumns}
          />
        </Box>
      )}

      {values.parameters[index]?.sourceType === "constant" && (
        <Box mt="1rem">
          <FormTextInput label={t`Value`} name={`parameters.${index}.value`} />
        </Box>
      )}

      {values.parameters[index]?.sourceType !== "ask-user" && (
        <Group mt="1rem">
          <FormRadioGroup name={`parameters.${index}.visibility`}>
            <Group>
              <Radio
                name={`parameters.${index}.visibility`}
                label={t`Editable`}
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
};
