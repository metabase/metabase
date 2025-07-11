import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  skipToken,
  useCreateFieldDimensionMutation,
  useDeleteFieldDimensionMutation,
  useGetFieldQuery,
  useGetFieldValuesQuery,
  useGetTableQueryMetadataQuery,
  useUpdateFieldValuesMutation,
} from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { FieldDataSelector } from "metabase/query_builder/components/DataSelector";
import {
  Alert,
  Button,
  Flex,
  Group,
  Select,
  type SelectProps,
  Stack,
  rem,
} from "metabase/ui";
import type { Database, Field, FieldId } from "metabase-types/api";

import {
  type ChangeOptions,
  CustomMappingModal,
  type Mapping,
} from "./CustomMappingModal";
import {
  DisplayValuesPicker,
  type RemappingValue,
} from "./DisplayValuesPicker";
import { NamingTip } from "./NamingTip";
import SubInputIllustration from "./illustrations/sub-input.svg?component";
import {
  getFieldRemappedValues,
  getFkTargetTableEntityNameOrNull,
  getOptions,
  getValue,
  hydrateTableFields,
  is403Error,
} from "./utils";

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
  const [sendToast] = useToast();
  const [hasChanged, setHasChanged] = useState(false);
  const [isCustomMappingOpen, setIsCustomMappingOpen] = useState(false);
  const [isFkTargetTouched, setIsFkTargetTouched] = useState(false);
  const [isChoosingInitialFkTarget, setIsChoosingInitialFkTarget] =
    useState(false);
  const id = getRawTableFieldId(field);
  const { data: fieldValues, error: fieldValuesError } =
    useGetFieldValuesQuery(id);
  const { data: fkTargetField } = useGetFieldQuery(
    field.fk_target_field_id == null
      ? skipToken
      : {
          id: field.fk_target_field_id,
          ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
        },
  );
  const { data: fkTargetTableData } = useGetTableQueryMetadataQuery(
    fkTargetField?.table_id == null
      ? skipToken
      : {
          id: fkTargetField.table_id,
          include_sensitive_fields: true,
          ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
        },
  );
  const fkTargetTable = useMemo(
    () => hydrateTableFields(fkTargetTableData),
    [fkTargetTableData],
  );
  const tables = useMemo(() => [fkTargetTable], [fkTargetTable]);

  const value = useMemo(() => getValue(field), [field]);
  const options = useMemo(() => {
    return getOptions(field, fieldValues?.values, fkTargetTable);
  }, [field, fieldValues, fkTargetTable]);
  const mapping = useMemo(() => {
    return getFieldRemappedValues(fieldValues?.values);
  }, [fieldValues?.values]);

  const isFkMapping = value === "foreign" || isChoosingInitialFkTarget;
  const fkRemappingFieldId = field.dimensions?.[0]?.human_readable_field_id;
  const hasFkMappingValue = isFkMapping && fkRemappingFieldId != null;
  const { data: fkRemappingFieldData } = useGetFieldQuery(
    hasFkMappingValue
      ? {
          id: fkRemappingFieldId,
          ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
        }
      : skipToken,
  );
  const fkRemappingField = hasFkMappingValue ? fkRemappingFieldData : undefined;
  const isFieldsAccessRestricted = is403Error(fieldValuesError);

  const [updateFieldValues] = useUpdateFieldValuesMutation();
  const [createFieldDimension] = useCreateFieldDimensionMutation();
  const [deleteFieldDimension] = useDeleteFieldDimensionMutation();

  const showToast = (error: unknown) => {
    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "var(--mb-color-warning)",
        message: t`Failed to update display values of ${field.display_name}`,
      });
    } else {
      sendToast({
        icon: "check",
        message: t`Display values of ${field.display_name} updated`,
      });
    }
  };

  const handleDisplayValueChange = async (value: RemappingValue) => {
    setHasChanged(false);
    setIsChoosingInitialFkTarget(false);

    if (value === "original") {
      const { error } = await deleteFieldDimension(id);

      showToast(error);

      if (!error) {
        setHasChanged(false);
      }
    } else if (value === "foreign") {
      // Try to find a entity name field from target table and choose it as remapping target field if it exists
      const entityNameFieldId = getFkTargetTableEntityNameOrNull(fkTargetTable);

      if (entityNameFieldId) {
        const { error } = await createFieldDimension({
          id,
          type: "external",
          name: field.display_name,
          human_readable_field_id: entityNameFieldId,
        });

        showToast(error);
      } else {
        // Enter a special state where we are choosing an initial value for FK target
        setHasChanged(true);
        setIsChoosingInitialFkTarget(true);
      }

      setIsFkTargetTouched(false);
    } else if (value === "custom") {
      const { error } = await createFieldDimension({
        id,
        type: "internal",
        name: field.display_name,
        human_readable_field_id: null,
      });

      showToast(error);

      if (!error) {
        setHasChanged(true);
        setIsCustomMappingOpen(true);
      }
    } else {
      throw new Error(t`Unrecognized mapping type`);
    }
  };

  const handleFkRemappingFieldChange = async (fkFieldId: FieldId) => {
    setIsChoosingInitialFkTarget(false);

    const { error } = await createFieldDimension({
      id,
      type: "external",
      name: field.display_name,
      human_readable_field_id: fkFieldId,
    });

    showToast(error);
  };

  const handleCustomMappingChange = async (
    remappings: Mapping,
    options: ChangeOptions | undefined,
  ) => {
    const { error } = await updateFieldValues({
      id,
      values: Array.from(remappings),
    });

    if (!options?.isAutomatic) {
      showToast(error);
    }
  };

  return (
    <Stack gap={0}>
      <DisplayValuesPicker
        options={options}
        value={isFkMapping ? "foreign" : value}
        onChange={handleDisplayValueChange}
        {...props}
      />

      {isFkMapping && (
        <>
          <Flex ml={rem(12)}>
            <SubInputIllustration />
          </Flex>

          {/**
           * FieldDataSelector won't work correctly when databases are present
           * but fkTargetTable is not. It would go to "schema" step of DataSelector
           * which does not exist in FieldDataSelector, hence this conditional render.
           */}
          {fkTargetTable && (
            <FieldDataSelector
              databases={[database]}
              isInitiallyOpen={isChoosingInitialFkTarget}
              selectedDatabase={database}
              selectedDatabaseId={database.id}
              selectedField={fkRemappingField}
              selectedFieldId={fkRemappingField?.id}
              selectedTable={fkTargetTable}
              selectedTableId={fkTargetTable?.id}
              setFieldFn={handleFkRemappingFieldChange}
              tables={tables}
              triggerElement={
                <Select
                  data={[
                    {
                      label:
                        fkRemappingField?.display_name ?? t`Choose a field`,
                      value: "choose-a-field",
                    },
                  ]}
                  dropdownOpened={false}
                  error={isFkTargetTouched && !fkRemappingField}
                  placeholder={t`Choose a field`}
                  value="choose-a-field"
                  w="100%"
                  onClick={(event) => event.preventDefault()}
                />
              }
              onClose={() => {
                setIsFkTargetTouched(true);
              }}
            />
          )}

          {hasChanged && hasFkMappingValue && <NamingTip mt="md" />}
        </>
      )}

      {value === "custom" && (
        <>
          {isFieldsAccessRestricted && (
            <Alert mt="md">
              {t`You need unrestricted data access on this table to map custom display values.`}
            </Alert>
          )}

          {!isFieldsAccessRestricted && (
            <>
              <CustomMappingModal
                isOpen={isCustomMappingOpen}
                value={mapping}
                onChange={handleCustomMappingChange}
                onClose={() => setIsCustomMappingOpen(false)}
              />

              <Group mt="sm">
                <Button
                  p={0}
                  size="compact-xs"
                  variant="subtle"
                  onClick={() => setIsCustomMappingOpen(true)}
                >
                  {t`Edit mapping`}
                </Button>
              </Group>

              {hasChanged && <NamingTip mt="md" />}
            </>
          )}
        </>
      )}
    </Stack>
  );
};
