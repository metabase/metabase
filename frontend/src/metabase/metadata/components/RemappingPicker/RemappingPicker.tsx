import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  skipToken,
  useCreateFieldDimensionMutation,
  useDeleteFieldDimensionMutation,
  useGetFieldQuery,
  useGetTableQueryMetadataQuery,
} from "metabase/api";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { FieldDataSelector } from "metabase/query_builder/components/DataSelector";
import { Flex, Select, type SelectProps, Stack } from "metabase/ui";
import { getRemappings } from "metabase-lib/v1/queries/utils/field";
import { isEntityName, isFK } from "metabase-lib/v1/types/utils/isa";
import type { Database, Field, FieldId, Table } from "metabase-types/api";

import {
  DisplayValuesPicker,
  type RemappingValue,
} from "../DisplayValuesPicker";

import { NamingTip } from "./NamingTip";
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
  const [hasChanged, setHasChanged] = useState(false);
  const [isChoosingInitialFkTarget, setIsChoosingInitialFkTarget] =
    useState(false);
  const id = getRawTableFieldId(field);
  const { data: fkTargetField } = useGetFieldQuery(
    field.fk_target_field_id == null
      ? skipToken
      : {
          id: field.fk_target_field_id,
          ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
        },
  );
  const { data: fkTargetTable } = useGetTableQueryMetadataQuery(
    fkTargetField?.table_id == null
      ? skipToken
      : {
          id: fkTargetField.table_id,
          ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
        },
  );

  const value = useMemo(() => getValue(field), [field]);
  const options = useMemo(() => {
    return getOptions(field, fkTargetTable);
  }, [field, fkTargetTable]);

  const isFkMapping = value === "foreign";
  const fkRemappingFieldId = field.dimensions?.[0]?.human_readable_field_id;
  const hasFkMappingValue = isFkMapping && fkRemappingFieldId != null;
  const { data: fkRemappingField } = useGetFieldQuery(
    hasFkMappingValue
      ? {
          id: fkRemappingFieldId,
          ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
        }
      : skipToken,
  );

  const [createFieldDimension] = useCreateFieldDimensionMutation();
  const [deleteFieldDimension] = useDeleteFieldDimensionMutation();

  const handleDisplayValueChange = async (value: RemappingValue) => {
    setHasChanged(false);
    setIsChoosingInitialFkTarget(false);

    if (value === "original") {
      await deleteFieldDimension(id);
      setHasChanged(false);
    } else if (value === "foreign") {
      // Try to find a entity name field from target table and choose it as remapping target field if it exists
      const entityNameFieldId = getFkTargetTableEntityNameOrNull(fkTargetTable);

      if (entityNameFieldId) {
        await createFieldDimension({
          id,
          type: "external",
          name: field.display_name,
          human_readable_field_id: entityNameFieldId,
        });
      } else {
        // Enter a special state where we are choosing an initial value for FK target
        setHasChanged(true);
        setIsChoosingInitialFkTarget(true);
      }
    } else if (value === "custom") {
      await createFieldDimension({
        id,
        type: "internal",
        name: field.display_name,
        human_readable_field_id: null,
      });
      setHasChanged(true);
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

      {(value === "foreign" || isChoosingInitialFkTarget) && (
        <>
          <Flex ml={12}>
            <SubInputIllustration />
          </Flex>

          <FieldDataSelector
            databases={[database]}
            isInitiallyOpen={isChoosingInitialFkTarget}
            selectedDatabase={database}
            selectedDatabaseId={database.id}
            selectedField={fkRemappingField}
            selectedFieldId={fkRemappingField?.id}
            selectedTable={fkTargetTable}
            selectedTableId={fkTargetTable?.id}
            triggerElement={
              <Select
                data={[
                  {
                    label: fkRemappingField?.display_name ?? t`Choose a field`,
                    value: "choose-a-field",
                  },
                ]}
                dropdownOpened={false}
                onClick={(event) => event.preventDefault()}
                value="choose-a-field"
                w="100%"
                // hasValue={hasFKMappingValue}
                // hasError={!fkRemappingField}
              />
            }
            setFieldFn={handelFkRemappingFieldChange}
          />
        </>
      )}
      {hasChanged && hasFkMappingValue && <NamingTip />}
    </Stack>
  );
};

function getOptions(field: Field, fkTargetTable: Table | undefined) {
  const options: RemappingValue[] = ["original"];

  if (hasForeignKeyTargetFields(field, fkTargetTable)) {
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
  fkTargetTable: Table | undefined,
): boolean {
  return isFK(field) && getTableFields(fkTargetTable).length > 0;
}

function getTableFields(table: Table | undefined): Field[] {
  return table?.fields ?? [];
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

function getFkTargetTableEntityNameOrNull(
  targetTable: Table | undefined,
): FieldId | undefined {
  const fields = getTableFields(targetTable);
  const nameField = fields.find((field) => isEntityName(field));
  return nameField ? getRawTableFieldId(nameField) : undefined;
}
