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
import { useMetadataToasts } from "metabase/metadata/hooks";
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
import type { MetadataEditEventDetail } from "metabase-types/analytics";
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

type RemappingPicker = Omit<SelectProps, "data" | "value" | "onChange"> & {
  database: Database;
  field: Field;
  onTrackMetadataChange: (detail: MetadataEditEventDetail) => void;
};

export const RemappingPicker = ({
  database,
  field,
  comboboxProps,
  onTrackMetadataChange,
  ...props
}: RemappingPicker) => {
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();
  const [hasChanged, setHasChanged] = useState(false);
  const [isCustomMappingOpen, setIsCustomMappingOpen] = useState(false);
  const [isFkTargetTouched, setIsFkTargetTouched] = useState(false);
  const [isChoosingDisplayValue, setIsChoosingDisplayValue] = useState(false);
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
  const {
    data: fieldValues,
    error: fieldValuesError,
    isLoading: isLoadingFieldValues,
  } = useGetFieldValuesQuery(id, {
    skip: value !== "custom" && !isChoosingDisplayValue,
  });
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
  const dimension = field.dimensions?.[0];

  const [updateFieldValues] = useUpdateFieldValuesMutation();
  const [createFieldDimension] = useCreateFieldDimensionMutation();
  const [deleteFieldDimension] = useDeleteFieldDimensionMutation();

  const sendDefaultToast = (error: unknown) => {
    if (error) {
      sendErrorToast(
        t`Failed to update display values of ${field.display_name}`,
      );
    } else {
      onTrackMetadataChange("display_values");
      sendSuccessToast(
        t`Display values of ${field.display_name} updated`,
        async () => {
          if (dimension) {
            const { error } = await createFieldDimension({
              id,
              type: dimension.type,
              name: dimension.name,
              human_readable_field_id: dimension.human_readable_field_id,
            });

            sendUndoToast(error);
          } else {
            const { error } = await deleteFieldDimension(id);
            sendUndoToast(error);
          }
        },
      );
    }
  };

  const handleDisplayValueChange = async (value: RemappingValue) => {
    setHasChanged(false);
    setIsChoosingInitialFkTarget(false);

    if (value === "original") {
      const { error } = await deleteFieldDimension(id);

      sendDefaultToast(error);

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

        sendDefaultToast(error);
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

      sendDefaultToast(error);

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

    sendDefaultToast(error);
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
      if (error) {
        sendErrorToast(
          t`Failed to update display values of ${field.display_name}`,
        );
      } else {
        sendSuccessToast(
          t`Display values of ${field.display_name} updated`,
          async () => {
            const { error } = await updateFieldValues({
              id,
              values: Array.from(mapping),
            });

            sendUndoToast(error);
          },
        );
      }
    }
  };

  return (
    <Stack gap={0}>
      <DisplayValuesPicker
        value={isFkMapping ? "foreign" : value}
        options={options}
        isLoadingFieldValues={isLoadingFieldValues}
        dropdownOpened={isChoosingDisplayValue}
        onDropdownOpen={() => setIsChoosingDisplayValue(true)}
        onDropdownClose={() => setIsChoosingDisplayValue(false)}
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
                  disabled={isLoadingFieldValues}
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
