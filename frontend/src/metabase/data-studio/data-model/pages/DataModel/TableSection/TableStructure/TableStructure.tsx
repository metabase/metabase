import { useState } from "react";
import { t } from "ttag";

import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { Link } from "metabase/common/components/Link";
import { useDataLayers } from "metabase/metadata/data-layers";
import {
  type EavBinding,
  type HistoryBinding,
  type TableStructure as TableStructureValue,
  getPeriodGranularityOptions,
  getRowIdentityLabel,
  getTableHiddenReason,
  getTableRoleLabel,
  getTableRoleOptions,
  getTableRoleRowDescription,
  isRoleA,
  isTableRole,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import {
  Badge,
  Button,
  Group,
  Icon,
  Pill,
  Select,
  Switch,
  Text,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { isDate } from "metabase-lib/v1/types/utils/isa";
import type { Field, FieldId, Table } from "metabase-types/api";

import {
  DETAILS_CELL_INPUT_CLASS_NAMES,
  DetailsEditableText,
} from "../../DetailPanel";

import S from "./TableStructure.module.css";

interface TableStructureProps {
  table: Table;
  readOnly: boolean;
}

/**
 * PROTOTYPE: mocked. A table's role and grain, plus the history or custom
 * property binding its role needs. Inferred in the browser and overridable.
 */
export function TableStructure({ table, readOnly }: TableStructureProps) {
  const {
    getTableStructure,
    setTableRole,
    setGrainDescription,
    setPeriodGranularity,
    setHistoryBinding,
    setEavBinding,
    setMainDate,
  } = useTableStructures();
  const structure = getTableStructure(table);
  const fields = table.fields ?? [];
  const { role } = structure;
  const { getTableDataLayer } = useDataLayers();
  const hiddenReason = getTableHiddenReason({
    table,
    role,
    dataLayer: getTableDataLayer(table.db_id, table.schema, table.id).layer,
  });

  return (
    <>
      <SidebarSection title={t`Structure`}>
        <DetailsTable>
          <DetailsRow
            label={t`Role`}
            fillValue
            labelAside={
              isRoleUnderReview(structure, readOnly) ? (
                <NeedsReviewBadge />
              ) : (
                <InferredIcon description={getRoleInference(structure)} />
              )
            }
            labelNote={
              // Read-only tables keep the badge here; there's no review cell
              structure.needsReview &&
              !isRoleUnderReview(structure, readOnly) && <NeedsReviewBadge />
            }
            value={
              <RoleValue
                structure={structure}
                disabled={readOnly}
                onChange={(role) => setTableRole(table, role)}
              />
            }
          />
          <DetailsRow
            label={t`Each row is`}
            fillValue
            value={
              <DetailsEditableText
                initialValue={structure.grainDescription}
                placeholder={
                  role ? getTableRoleRowDescription(role) : t`Describe one row`
                }
                isMultiline
                isOptional
                isDisabled={readOnly}
                onChange={(value) => setGrainDescription(table, value.trim())}
                data-testid="table-grain-description-input"
              />
            }
          />
          <DetailsRow
            label={t`Grain`}
            value={
              <GrainFields table={table} grainFields={structure.grainFields} />
            }
          />
          <DetailsRow
            label={t`Row identity`}
            value={getRowIdentityLabel(structure.rowIdentity)}
          />
          <DetailsRow
            label={t`Main date`}
            fillValue
            labelAside={
              isMainDateUnderReview(structure, readOnly) ? (
                <NeedsReviewBadge />
              ) : (
                <InferredIcon description={getMainDateInference(structure)} />
              )
            }
            labelNote={
              // Read-only tables keep the badge here; there's no review cell
              structure.mainDateNeedsReview &&
              !isMainDateUnderReview(structure, readOnly) && (
                <NeedsReviewBadge />
              )
            }
            value={
              <MainDateValue
                fields={fields}
                structure={structure}
                disabled={readOnly}
                onChange={(fieldId) => setMainDate(table, fieldId)}
              />
            }
          />
          <DetailsRow
            label={t`Visibility`}
            value={
              hiddenReason ? (
                <Text>{t`Hidden: ${hiddenReason}`}</Text>
              ) : (
                <Text>{t`Shown to people who can see its data layer`}</Text>
              )
            }
          />
          {role && isRoleA(role, "role/PeriodicSnapshotFact") && (
            <DetailsRow
              label={t`Period`}
              fillValue
              value={
                <Select
                  aria-label={t`Period`}
                  classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
                  data={getPeriodGranularityOptions()}
                  value={structure.periodGranularity}
                  allowDeselect={false}
                  disabled={readOnly}
                  onChange={(value) => {
                    const option = getPeriodGranularityOptions().find(
                      (option) => option.value === value,
                    );
                    if (option) {
                      setPeriodGranularity(table, option.value);
                    }
                  }}
                />
              }
            />
          )}
        </DetailsTable>
      </SidebarSection>

      {role && isRoleA(role, "role/HistoryDimension") && (
        <HistoryBindingSection
          fields={fields}
          binding={structure.history}
          disabled={readOnly}
          onChange={(history) => setHistoryBinding(table, history)}
        />
      )}

      {role && isRoleA(role, "role/CustomPropertyTable") && (
        <EavBindingSection
          fields={fields}
          binding={structure.eav}
          disabled={readOnly}
          onChange={(eav) => setEavBinding(table, eav)}
        />
      )}
    </>
  );
}

type RoleInputProps = {
  structure: TableStructureValue;
  disabled: boolean;
  onChange: (role: TableStructureValue["role"]) => void;
};

/** A weak guess an admin can act on: shown as text to confirm or change */
function isRoleUnderReview(
  { needsReview, inference }: TableStructureValue,
  disabled: boolean,
) {
  return needsReview && !disabled && inference.role != null;
}

function NeedsReviewBadge() {
  return (
    <Badge color="warning" variant="light" flex="0 0 auto">
      {t`Needs review`}
    </Badge>
  );
}

/**
 * A weak guess as plain text with its AI icon, to confirm or change.
 * Either choice records it as the admin's, so the caller swaps in its select.
 */
function ReviewValue({
  value,
  inference,
  onConfirm,
  onChange,
  "data-testid": dataTestId,
}: {
  value: string;
  /** Why sync guessed it, shown on the AI icon */
  inference: string | null;
  onConfirm: () => void;
  /** Confirms, then opens the select so another value can be picked */
  onChange: () => void;
  "data-testid"?: string;
}) {
  return (
    <Group
      flex={1}
      justify="space-between"
      gap="sm"
      wrap="nowrap"
      px="lg"
      py="sm"
      data-testid={dataTestId}
    >
      <Group gap="xs" wrap="nowrap" miw={0}>
        <Text truncate>{value}</Text>
        <InferredIcon description={inference} />
      </Group>
      <Group gap="xs" wrap="nowrap" flex="0 0 auto">
        <Button size="compact-sm" variant="filled" onClick={onConfirm}>
          {t`Confirm`}
        </Button>
        <Button size="compact-sm" onClick={onChange}>
          {t`Change`}
        </Button>
      </Group>
    </Group>
  );
}

/** The role, or its weak guess to confirm or change */
function RoleValue({ structure, disabled, onChange }: RoleInputProps) {
  const [isSelectOpenOnMount, setIsSelectOpenOnMount] = useState(false);
  const { inference } = structure;

  if (isRoleUnderReview(structure, disabled) && inference.role) {
    const inferredRole = inference.role;
    return (
      <ReviewValue
        value={getTableRoleLabel(inferredRole)}
        inference={getRoleInference(structure)}
        onConfirm={() => onChange(inferredRole)}
        onChange={() => {
          setIsSelectOpenOnMount(true);
          onChange(inferredRole);
        }}
        data-testid="table-role-review"
      />
    );
  }

  return (
    <RoleSelect
      structure={structure}
      disabled={disabled}
      isOpenOnMount={isSelectOpenOnMount}
      onChange={onChange}
    />
  );
}

function RoleSelect({
  structure,
  disabled,
  isOpenOnMount,
  onChange,
}: RoleInputProps & { isOpenOnMount: boolean }) {
  const { role, inference } = structure;
  // Once an admin picks something else, point out what sync guessed
  const markedRole = role !== inference.role ? inference.role : null;
  const options = getTableRoleOptions().map((group) => ({
    ...group,
    items: group.items.map((item) =>
      item.value === markedRole
        ? { ...item, label: t`${item.label} (Inferred)` }
        : item,
    ),
  }));

  return (
    <Select
      aria-label={t`Role`}
      classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
      data={options}
      value={role}
      placeholder={t`Choose a role`}
      searchable
      allowDeselect={false}
      disabled={disabled}
      autoFocus={isOpenOnMount}
      defaultDropdownOpened={isOpenOnMount}
      onChange={(value) => {
        if (isTableRole(value)) {
          onChange(value);
        }
      }}
      data-testid="table-role-select"
    />
  );
}

/** Why sync picked the role; nothing once an admin has set it */
function getRoleInference({
  inference,
  isRoleOverridden,
}: TableStructureValue): string | null {
  return isRoleOverridden ? null : t`Inferred: ${inference.signal}`;
}

/** Why sync picked the main date; nothing once an admin has set it */
function getMainDateInference({
  mainDateInference,
  isMainDateOverridden,
}: TableStructureValue): string | null {
  return isMainDateOverridden ? null : t`Inferred: ${mainDateInference.signal}`;
}

/** An AI icon for an inferred value, explained on hover */
function InferredIcon({ description }: { description: string | null }) {
  if (description == null) {
    return null;
  }
  return (
    <Tooltip label={description} maw={280} multiline>
      <Icon
        name="ai"
        c="text-secondary"
        aria-label={description}
        flex="0 0 auto"
      />
    </Tooltip>
  );
}

function GrainFields({
  table,
  grainFields,
}: {
  table: Table;
  grainFields: Field[];
}) {
  if (grainFields.length === 0) {
    return (
      <Text c="text-secondary">
        {t`No grain columns. Mark them in each field's settings.`}
      </Text>
    );
  }
  return (
    <Group gap="xs">
      {grainFields.map((field) => {
        const fieldId = getRawTableFieldId(field);
        return (
          <Link
            key={fieldId}
            className={S.grainLink}
            to={Urls.dataStudioData({
              databaseId: table.db_id,
              schemaName: table.schema,
              tableId: table.id,
              tab: "field",
              fieldId,
            })}
            aria-label={t`Open ${field.display_name}`}
          >
            <Pill size="md" className={S.grainPill}>
              {field.display_name}
            </Pill>
          </Link>
        );
      })}
    </Group>
  );
}

type MainDateInputProps = {
  structure: TableStructureValue;
  disabled: boolean;
  onChange: (fieldId: FieldId | null | undefined) => void;
};

function getMainDateFieldId({ mainDateField }: TableStructureValue) {
  return mainDateField ? getRawTableFieldId(mainDateField) : null;
}

/** A weak main date guess an admin can act on, like the role's */
function isMainDateUnderReview(
  { mainDateNeedsReview }: TableStructureValue,
  disabled: boolean,
) {
  return mainDateNeedsReview && !disabled;
}

/** The main date, or its weak guess to confirm or change */
function MainDateValue({
  fields,
  structure,
  disabled,
  onChange,
}: MainDateInputProps & { fields: Field[] }) {
  const [isSelectOpenOnMount, setIsSelectOpenOnMount] = useState(false);
  const inferredFieldId = structure.mainDateInference.fieldId;

  if (isMainDateUnderReview(structure, disabled)) {
    return (
      <ReviewValue
        // Not overridden, so the current main date is the inferred one
        value={structure.mainDateField?.display_name ?? t`No main date`}
        inference={getMainDateInference(structure)}
        onConfirm={() => onChange(inferredFieldId)}
        onChange={() => {
          setIsSelectOpenOnMount(true);
          onChange(inferredFieldId);
        }}
        data-testid="table-main-date-review"
      />
    );
  }

  const mainDateFieldId = getMainDateFieldId(structure);
  return (
    <FieldSelect
      label={t`Main date`}
      fields={fields.filter((field) => isDate(field))}
      value={mainDateFieldId}
      // Once an admin picks something else, point out what sync guessed
      inferredFieldId={
        mainDateFieldId !== inferredFieldId ? inferredFieldId : null
      }
      placeholder={t`No main date`}
      clearable
      disabled={disabled}
      isOpenOnMount={isSelectOpenOnMount}
      onChange={onChange}
    />
  );
}

function FieldSelect({
  label,
  fields,
  value,
  inferredFieldId = null,
  placeholder = t`Choose a column`,
  clearable,
  disabled,
  isOpenOnMount = false,
  onChange,
}: {
  label: string;
  fields: Field[];
  value: FieldId | null;
  /** Marked "(Inferred)" in the list */
  inferredFieldId?: FieldId | null;
  placeholder?: string;
  clearable?: boolean;
  disabled: boolean;
  isOpenOnMount?: boolean;
  onChange: (fieldId: FieldId | null) => void;
}) {
  return (
    <Select
      aria-label={label}
      classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
      data={fields.map((field) => {
        const fieldId = getRawTableFieldId(field);
        return {
          value: String(fieldId),
          label:
            fieldId === inferredFieldId
              ? t`${field.display_name} (Inferred)`
              : field.display_name,
        };
      })}
      value={value != null ? String(value) : null}
      placeholder={placeholder}
      searchable
      clearable={clearable}
      allowDeselect={clearable}
      disabled={disabled}
      autoFocus={isOpenOnMount}
      defaultDropdownOpened={isOpenOnMount}
      onChange={(value) => onChange(value != null ? Number(value) : null)}
    />
  );
}

function HistoryBindingSection({
  fields,
  binding,
  disabled,
  onChange,
}: {
  fields: Field[];
  binding: HistoryBinding;
  disabled: boolean;
  onChange: (binding: Partial<HistoryBinding>) => void;
}) {
  return (
    <SidebarSection title={t`History`}>
      <Text size="sm" c="text-secondary">
        {t`Each row is one version of a thing. Counts use distinct durable keys, so versions aren't counted twice.`}
      </Text>
      <DetailsTable>
        <DetailsRow
          label={t`Durable key`}
          fillValue
          value={
            <FieldSelect
              label={t`Durable key`}
              fields={fields}
              value={binding.durableKeyFieldId}
              disabled={disabled}
              onChange={(durableKeyFieldId) => onChange({ durableKeyFieldId })}
            />
          }
        />
        <DetailsRow
          label={t`Valid from`}
          fillValue
          value={
            <FieldSelect
              label={t`Valid from`}
              fields={fields}
              value={binding.validFromFieldId}
              disabled={disabled}
              onChange={(validFromFieldId) => onChange({ validFromFieldId })}
            />
          }
        />
        <DetailsRow
          label={t`Valid to`}
          fillValue
          value={
            <FieldSelect
              label={t`Valid to`}
              fields={fields}
              value={binding.validToFieldId}
              clearable
              disabled={disabled}
              onChange={(validToFieldId) => onChange({ validToFieldId })}
            />
          }
        />
        <DetailsRow
          label={t`Current row flag`}
          fillValue
          value={
            <FieldSelect
              label={t`Current row flag`}
              fields={fields}
              value={binding.currentFlagFieldId}
              clearable
              disabled={disabled}
              onChange={(currentFlagFieldId) =>
                onChange({ currentFlagFieldId })
              }
            />
          }
        />
        <DetailsRow
          label={t`Default rows`}
          value={
            <Switch
              py="xs"
              label={t`Show only the current version`}
              checked={binding.currentRowsOnly}
              disabled={disabled}
              onChange={(event) =>
                onChange({ currentRowsOnly: event.target.checked })
              }
            />
          }
        />
      </DetailsTable>
    </SidebarSection>
  );
}

function EavBindingSection({
  fields,
  binding,
  disabled,
  onChange,
}: {
  fields: Field[];
  binding: EavBinding;
  disabled: boolean;
  onChange: (binding: Partial<EavBinding>) => void;
}) {
  return (
    <SidebarSection title={t`Custom properties`}>
      <Text size="sm" c="text-secondary">
        {t`Each row is one property value of a thing. Properties can be pivoted into columns of that thing.`}
      </Text>
      <DetailsTable>
        <DetailsRow
          label={t`Entity key`}
          fillValue
          value={
            <FieldSelect
              label={t`Entity key`}
              fields={fields}
              value={binding.entityKeyFieldId}
              disabled={disabled}
              onChange={(entityKeyFieldId) => onChange({ entityKeyFieldId })}
            />
          }
        />
        <DetailsRow
          label={t`Property`}
          fillValue
          value={
            <FieldSelect
              label={t`Property`}
              fields={fields}
              value={binding.propertyFieldId}
              disabled={disabled}
              onChange={(propertyFieldId) => onChange({ propertyFieldId })}
            />
          }
        />
        <DetailsRow
          label={t`Value`}
          fillValue
          value={
            <FieldSelect
              label={t`Value`}
              fields={fields}
              value={binding.valueFieldId}
              disabled={disabled}
              onChange={(valueFieldId) => onChange({ valueFieldId })}
            />
          }
        />
        <DetailsRow
          label={t`Columns`}
          value={
            <Switch
              py="xs"
              label={t`Pivot properties into columns`}
              checked={binding.pivotToColumns}
              disabled={disabled}
              onChange={(event) =>
                onChange({ pivotToColumns: event.target.checked })
              }
            />
          }
        />
      </DetailsTable>
    </SidebarSection>
  );
}
