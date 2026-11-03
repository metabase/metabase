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
import {
  canCoerceFieldType,
  getFieldRawName,
} from "metabase/metadata/utils/field";
import { Code, Stack, Switch } from "metabase/ui";
import type { Field, FieldId, Table } from "metabase-types/api";

import { trackMetadataChange } from "../../../analytics";
import { DetailsEditableText } from "../DetailPanel";

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
            value={
              <DetailsEditableText
                initialValue={field.display_name}
                placeholder={t`Give this field a name`}
                maxLength={254}
                isDisabled={readOnly}
                fw="bold"
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
        </DetailsTable>
      </SidebarSection>
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
