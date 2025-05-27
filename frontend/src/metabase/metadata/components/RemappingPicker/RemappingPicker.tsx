import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  skipToken,
  useCreateFieldDimensionMutation,
  useDeleteFieldDimensionMutation,
  useGetFieldQuery,
} from "metabase/api";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { FieldDataSelector } from "metabase/query_builder/components/DataSelector";
import { Flex, Select, type SelectProps, Stack } from "metabase/ui";
import { getRemappings } from "metabase-lib/v1/queries/utils/field";
import { isEntityName, isFK } from "metabase-lib/v1/types/utils/isa";
import type { Database, Field, FieldId } from "metabase-types/api";

import {
  DisplayValuesPicker,
  type RemappingValue,
} from "../DisplayValuesPicker";

import SubInputIllustration from "./illustrations/sub-input.svg?component";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  database: Database;
  field: Field;
}

export const RemappingPicker = ({
  comboboxProps,
  database,
  field,
  ...props
}: Props) => {
  const id = getRawTableFieldId(field);
  const { data: fkTargetField } = useGetFieldQuery(
    field.fk_target_field_id == null
      ? skipToken
      : {
          id: field.fk_target_field_id,
          ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
        },
  );
  const value = useMemo(() => getValue(field), [field]);
  const options = useMemo(() => {
    return getOptions(field, fkTargetField);
  }, [field, fkTargetField]);
  const isFkMapping = value === "foreign";

  const fkRemappingFieldId = field.dimensions?.[0]?.human_readable_field_id;
  const hasFKMappingValue = isFkMapping && fkRemappingFieldId !== null;
  const { data: fkRemappingField } = useGetFieldQuery(
    hasFKMappingValue
      ? {
          id: fkRemappingFieldId,
          ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
        }
      : skipToken,
  );

  const [createFieldDimension] = useCreateFieldDimensionMutation();
  const [deleteFieldDimension] = useDeleteFieldDimensionMutation();

  const handleDisplayValueChange = (value: RemappingValue) => {
    if (value === "original") {
      deleteFieldDimension(id);
    } else if (value === "foreign") {
      // Try to find a entity name field from target table and choose it as remapping target field if it exists
      const entityNameFieldId = getFKTargetTableEntityNameOrNull(field);

      if (entityNameFieldId) {
        createFieldDimension({
          id,
          type: "external",
          name: field.display_name,
          human_readable_field_id: entityNameFieldId,
        });
      } else {
        // Enter a special state where we are choosing an initial value for FK target
        // this.setState({
        //   hasChanged: true,
        //   isChoosingInitialFkTarget: true,
        // });
      }
    } else if (value === "custom") {
      createFieldDimension({
        id,
        type: "internal",
        name: field.display_name,
        human_readable_field_id: null,
      });
    } else {
      throw new Error(t`Unrecognized mapping type`);
    }
  };

  const handelFkRemappingFieldChange = (_fkRemappingFieldId: FieldId) => {};

  return (
    <Stack gap={0}>
      <DisplayValuesPicker
        options={options}
        value={value}
        onChange={handleDisplayValueChange}
        {...props}
      />

      {value === "foreign" && (
        <>
          <Flex ml={12}>
            <SubInputIllustration />
          </Flex>

          <FieldDataSelector
            // isInitiallyOpen={isChoosingInitialFkTarget}
            databases={[database]}
            selectedDatabase={database}
            selectedDatabaseId={database.id}
            selectedTable={fkTargetField?.table}
            selectedTableId={fkTargetField?.table?.id}
            selectedField={fkRemappingField}
            selectedFieldId={fkRemappingField?.id}
            triggerElement={
              <Select
                data={[
                  {
                    label: fkRemappingField?.display_name ?? t`Choose a field`,
                    value: "hack",
                  },
                ]}
                dropdownOpened={false}
                onClick={(event) => event.preventDefault()}
                value="hack"
                w="100%"
                // hasValue={hasFKMappingValue}
                // hasError={!fkRemappingField}
              />
            }
            setFieldFn={handelFkRemappingFieldChange}
          />
        </>
      )}
    </Stack>
  );
};

function getOptions(field: Field, fkTargetField: Field | undefined) {
  const options: RemappingValue[] = ["original"];

  if (hasForeignKeyTargetFields(field, fkTargetField)) {
    options.push("foreign");
  }

  if (hasMappableNumeralValues(field)) {
    options.push("custom");
  }

  return options;
}

function getValue(field: Field): RemappingValue {
  if (_.isEmpty(field.dimensions)) {
    return "original";
  }

  if (field.dimensions?.[0]?.type === "external") {
    return "foreign";
  }

  if (field.dimensions?.[0]?.type === "internal") {
    return "custom";
  }

  throw new Error(t`Unrecognized mapping type`);
}

function hasForeignKeyTargetFields(
  field: Field,
  fkTargetField: Field | undefined,
): boolean {
  return isFK(field) && getForeignKeyTargetFields(fkTargetField).length > 0;
}

function getForeignKeyTargetFields(field: Field | undefined) {
  return field?.table?.fields ?? [];
}

function hasMappableNumeralValues(field: Field): boolean {
  const remapping = new Map(getRemappings(field));

  // Only show the "custom" option if we have some values that can be mapped to user-defined custom values
  // (for a field without user-defined remappings, every key of `field.remappings` has value `undefined`)
  return (
    remapping.size > 0 &&
    [...remapping.keys()].every(
      (key) => typeof key === "number" || key === null,
    )
  );
}

function getFKTargetTableEntityNameOrNull(field: Field): FieldId | undefined {
  const fkTargetFields = getForeignKeyTargetFields(field);
  const nameField = fkTargetFields.find((field) => isEntityName(field));
  return nameField ? getRawTableFieldId(nameField) : undefined;
}
