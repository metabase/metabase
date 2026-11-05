import { t } from "ttag";

import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import {
  BehaviorSection,
  CoercionStrategyPicker,
  FormattingSection,
  MetadataSection,
} from "metabase/metadata/components";
import {
  useFieldCasting,
  useFieldUpdateHandlers,
} from "metabase/metadata/hooks";
import { useTableStructures } from "metabase/metadata/table-structure";
import {
  canCoerceFieldType,
  getFieldRawName,
} from "metabase/metadata/utils/field";
import { Code, Stack, Switch, Text } from "metabase/ui";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { Field, FieldId, Table } from "metabase-types/api";

import { trackMetadataChange } from "../../../analytics";
import { DetailsEditableText } from "../DetailPanel";

import { CustomFieldSection } from "./CustomFieldSection";

interface FieldDetailsProps {
  field: Field;
  table: Table;
  getFieldHref: (fieldId: FieldId) => string;
}

/**
 * A field's settings in the drawer: an editable details table with the name,
 * description, and data type, followed by the shared metadata sections.
 */
export function FieldDetails({
  field,
  table,
  getFieldHref,
}: FieldDetailsProps) {
  const readOnly = !table.can_write;
  const { handleNameChange, handleDescriptionChange } = useFieldUpdateHandlers({
    field,
  });

  const saveName = (value: string) => {
    const name = value.trim();
    if (name.length > 0 && name !== field.display_name) {
      handleNameChange(name);
    }
  };

  const saveDescription = (value: string) => {
    const description = value.trim();
    if (description !== (field.description ?? "")) {
      handleDescriptionChange(description);
    }
  };

  return (
    <Stack gap="xxl" data-testid="field-section">
      <SidebarSection title={t`Details`}>
        <DetailsTable>
          <DetailsRow
            label={t`Display name`}
            fillValue
            value={
              <DetailsEditableText
                initialValue={field.display_name}
                placeholder={t`Give this field a name`}
                maxLength={254}
                isDisabled={readOnly}
                onChange={saveName}
                data-testid="field-display-name-input"
              />
            }
          />
          <DetailsRow
            label={t`Raw name`}
            value={<Code>{getFieldRawName(field)}</Code>}
          />
          <DetailsRow
            label={t`Description`}
            fillValue
            value={
              <DetailsEditableText
                initialValue={field.description}
                placeholder={t`No description`}
                isMultiline
                isOptional
                isDisabled={readOnly}
                onChange={saveDescription}
                data-testid="field-description-input"
              />
            }
          />
          <DetailsRow
            label={t`Data type`}
            value={<Code>{field.database_type}</Code>}
          />
          {canCoerceFieldType(field) && (
            <DetailsRow
              label={t`Casting`}
              value={<FieldCastingInput field={field} disabled={readOnly} />}
            />
          )}
          <DetailsRow
            label={t`Grain`}
            value={<FieldGrainInput field={field} disabled={readOnly} />}
          />
        </DetailsTable>
      </SidebarSection>
      <CustomFieldSection field={field} table={table} />
      <SidebarSection title={t`Metadata`}>
        <MetadataSection
          field={field}
          table={table}
          getFieldHref={getFieldHref}
          disabled={readOnly}
          onTrackMetadataChange={trackMetadataChange}
        />
      </SidebarSection>
      <SidebarSection title={t`Behavior`}>
        <BehaviorSection
          field={field}
          databaseId={table.db_id}
          disabled={readOnly}
          onTrackMetadataChange={trackMetadataChange}
        />
      </SidebarSection>
      <SidebarSection title={t`Formatting`}>
        <FormattingSection
          field={field}
          disabled={readOnly}
          onTrackMetadataChange={trackMetadataChange}
        />
      </SidebarSection>
    </Stack>
  );
}

/** PROTOTYPE: mocked. Whether the field is one of the columns that make a row unique. */
function FieldGrainInput({
  field,
  disabled,
}: {
  field: Field;
  disabled: boolean;
}) {
  const { isGrainField, setFieldGrain } = useTableStructures();
  const isPrimaryKey = isPK(field);

  return (
    <Stack gap="xs" py="xs">
      <Switch
        label={t`This field is part of what makes a row unique`}
        checked={isGrainField(field)}
        disabled={disabled}
        onChange={(event) => {
          const isGrain = event.target.checked;
          // Matching the default (primary keys are the grain) clears the override
          setFieldGrain(field, isGrain === isPrimaryKey ? null : isGrain);
        }}
        data-testid="field-grain-switch"
      />
      <Text size="sm" c="text-secondary">
        {isPrimaryKey
          ? t`On by default: this is a primary key column.`
          : t`Off by default: only primary key columns start as grain.`}
      </Text>
    </Stack>
  );
}

function FieldCastingInput({
  field,
  disabled,
}: {
  field: Field;
  disabled: boolean;
}) {
  const {
    isCasting,
    autoFocusCoercionPicker,
    isCoercionPickerOpen,
    setIsCoercionPickerOpen,
    handleCastingChange,
    handleCoercionStrategyChange,
  } = useFieldCasting({ field, onTrackMetadataChange: trackMetadataChange });

  return (
    <Stack gap="sm" py="xs">
      <Switch
        checked={isCasting}
        disabled={disabled}
        label={t`Cast to a specific data type`}
        onChange={handleCastingChange}
      />
      {isCasting && (
        <CoercionStrategyPicker
          autoFocus={autoFocusCoercionPicker}
          baseType={field.base_type}
          disabled={disabled}
          dropdownOpened={isCoercionPickerOpen}
          value={field.coercion_strategy ?? undefined}
          onChange={handleCoercionStrategyChange}
          onDropdownClose={() => setIsCoercionPickerOpen(false)}
          onDropdownOpen={() => setIsCoercionPickerOpen(true)}
        />
      )}
    </Stack>
  );
}
