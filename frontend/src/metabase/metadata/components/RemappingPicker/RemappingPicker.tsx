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
import { Select, type SelectProps } from "metabase/ui";
import { getRemappings } from "metabase-lib/v1/queries/utils/field";
import { isEntityName, isFK } from "metabase-lib/v1/types/utils/isa";
import type { Field, FieldId } from "metabase-types/api";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  field: Field;
}

export const RemappingPicker = ({ comboboxProps, field, ...props }: Props) => {
  const id = getRawTableFieldId(field);
  const { data: fkTargetField } = useGetFieldQuery(
    field.fk_target_field_id == null
      ? skipToken
      : {
          id: field.fk_target_field_id,
          ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
        },
  );

  const [createFieldDimension] = useCreateFieldDimensionMutation();
  const [deleteFieldDimension] = useDeleteFieldDimensionMutation();
  const value = useMemo(() => getValue(field), [field]);
  const data = useMemo(
    () => getData(field, fkTargetField, value),
    [field, fkTargetField, value],
  );

  const handleChange = (value: string) => {
    const newValue = value as RemappingValue;

    if (newValue === "original") {
      deleteFieldDimension(id);
    } else if (newValue === "foreign") {
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
    } else if (newValue === "custom") {
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

  return (
    <Select
      comboboxProps={{
        middlewares: {
          flip: true,
          size: {
            padding: 6,
          },
        },
        position: "bottom-start",
        ...comboboxProps,
      }}
      data={data}
      value={value}
      onChange={handleChange}
      {...props}
    />
  );
};

type RemappingValue = "original" | "foreign" | "custom";

function getData(
  field: Field,
  fkTargetField: Field | undefined,
  value: RemappingValue,
) {
  const data = [
    {
      label: t`Use original value`,
      value: "original",
    },
  ];

  if (hasForeignKeyTargetFields(field, fkTargetField) || value === "foreign") {
    data.push({
      label: t`Use foreign key`,
      value: "foreign",
    });
  }

  if (hasMappableNumeralValues(field) || value === "custom") {
    data.push({
      label: t`Custom mapping`,
      value: "custom",
    });
  }

  return data;
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
