import { useState } from "react";
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
  MetadataCardVariantProvider,
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
import { Code, Stack, Switch, Tabs, Text } from "metabase/ui";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { Field, FieldId, Table } from "metabase-types/api";

import { trackMetadataChange } from "../../../analytics";
import { DetailsEditableText } from "../DetailPanel";

import { CustomFieldSection } from "./CustomFieldSection";
import {
  FieldCorrectionInput,
  FieldHistoryRoleInput,
  useIsHistoryAttribute,
  useIsHistoryTable,
} from "./FieldHistoryRoleInput";
import { FieldSemanticsSection } from "./FieldSemanticsSection";
import { GroupingsSection, useCanHaveGroupings } from "./GroupingsSection";
import { ValueOrderSection, useHasValueKind } from "./ValueOrderSection";

type FieldTab = "details" | "values" | "behavior" | "formatting";

const FIELD_TABS: FieldTab[] = ["details", "values", "behavior", "formatting"];

interface FieldDetailsProps {
  field: Field;
  table: Table;
  getFieldHref: (fieldId: FieldId) => string;
}

/**
 * A field's settings in the drawer, in tabs: its details and metadata, how
 * its values relate and group, and the shared behavior and formatting.
 */
export function FieldDetails({ field, table }: FieldDetailsProps) {
  const readOnly = !table.can_write;
  const isHistoryTable = useIsHistoryTable(table);
  const isHistoryAttribute = useIsHistoryAttribute(field, table);
  const { handleNameChange, handleDescriptionChange } = useFieldUpdateHandlers({
    field,
  });
  // PROTOTYPE: the tab lives in state, not the URL, and carries over when
  // another field opens
  const [tab, setTab] = useState<FieldTab>("details");
  const hasValueKind = useHasValueKind(field);
  const canHaveGroupings = useCanHaveGroupings(field, table);
  const hasValuesTab = hasValueKind || canHaveGroupings;
  // A field with nothing on Values falls back to Details
  const visibleTab = tab === "values" && !hasValuesTab ? "details" : tab;
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
    <Tabs
      value={visibleTab}
      onChange={(value) => {
        const next = FIELD_TABS.find((known) => known === value);
        if (next) {
          setTab(next);
        }
      }}
      data-testid="field-section"
    >
      {/* Bleeds into the panel's padding so the border spans the drawer */}
      <Tabs.List mb="xl" mx="-xl" px="xl">
        <Tabs.Tab value="details">{t`Details`}</Tabs.Tab>
        {hasValuesTab && <Tabs.Tab value="values">{t`Values`}</Tabs.Tab>}
        <Tabs.Tab value="behavior">{t`Behavior`}</Tabs.Tab>
        <Tabs.Tab value="formatting">{t`Formatting`}</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="details">
        <Stack gap="xxl">
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
                  value={
                    <FieldCastingInput field={field} disabled={readOnly} />
                  }
                />
              )}
              <DetailsRow
                label={t`Grain`}
                value={<FieldGrainInput field={field} disabled={readOnly} />}
              />
              {isHistoryTable && (
                <DetailsRow
                  label={t`History`}
                  value={
                    <FieldHistoryRoleInput
                      field={field}
                      table={table}
                      disabled={readOnly}
                    />
                  }
                />
              )}
              {isHistoryTable && isHistoryAttribute && (
                <DetailsRow
                  label={t`Changes`}
                  value={
                    <FieldCorrectionInput
                      field={field}
                      table={table}
                      disabled={readOnly}
                    />
                  }
                />
              )}
            </DetailsTable>
          </SidebarSection>
          <CustomFieldSection field={field} table={table} />
          <FieldSemanticsSection field={field} table={table} />
        </Stack>
      </Tabs.Panel>

      {hasValuesTab && (
        <Tabs.Panel value="values">
          <Stack gap="xxl">
            <ValueOrderSection field={field} table={table} />
            <GroupingsSection field={field} table={table} />
          </Stack>
        </Tabs.Panel>
      )}

      {/* One section each, so the tab names and frames them: no card */}
      <Tabs.Panel value="behavior">
        <MetadataCardVariantProvider value="plain">
          <BehaviorSection
            field={field}
            databaseId={table.db_id}
            disabled={readOnly}
            onTrackMetadataChange={trackMetadataChange}
          />
        </MetadataCardVariantProvider>
      </Tabs.Panel>

      <Tabs.Panel value="formatting">
        <MetadataCardVariantProvider value="plain">
          <FormattingSection
            field={field}
            disabled={readOnly}
            onTrackMetadataChange={trackMetadataChange}
          />
        </MetadataCardVariantProvider>
      </Tabs.Panel>
    </Tabs>
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
