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
            labelAside={<ValueOriginIcon origin={getRoleOrigin(structure)} />}
            labelNote={
              <RoleNote
                structure={structure}
                disabled={readOnly}
                onChange={(role) => setTableRole(table, role)}
              />
            }
            value={
              <RoleSelect
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
              <ValueOriginIcon origin={getMainDateOrigin(structure)} />
            }
            labelNote={
              <MainDateNote
                structure={structure}
                disabled={readOnly}
                onChange={(fieldId) => setMainDate(table, fieldId)}
              />
            }
            value={
              <MainDateSelect
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

function RoleSelect({ structure, disabled, onChange }: RoleInputProps) {
  return (
    <Select
      aria-label={t`Role`}
      classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
      data={getTableRoleOptions()}
      value={structure.role}
      placeholder={t`Choose a role`}
      searchable
      allowDeselect={false}
      disabled={disabled}
      onChange={(value) => {
        if (isTableRole(value)) {
          onChange(value);
        }
      }}
      data-testid="table-role-select"
    />
  );
}

const NOTE_ACTION_CLASS_NAMES = {
  root: S.noteAction,
  label: S.noteActionLabel,
};

/** Whether sync inferred the value or an admin set it, and why */
type ValueOrigin = { isInferred: boolean; description: string };

/** No origin once an admin confirms the guess: there's nothing left to flag */
function getRoleOrigin({
  role,
  inference,
  isRoleOverridden,
}: TableStructureValue): ValueOrigin | null {
  if (!isRoleOverridden) {
    return { isInferred: true, description: t`Inferred: ${inference.signal}` };
  }
  return role === inference.role
    ? null
    : { isInferred: false, description: t`Set by an admin` };
}

function getMainDateOrigin(structure: TableStructureValue): ValueOrigin | null {
  const { mainDateInference, isMainDateOverridden } = structure;
  if (!isMainDateOverridden) {
    return {
      isInferred: true,
      description: t`Inferred: ${mainDateInference.signal}`,
    };
  }
  return getMainDateFieldId(structure) === mainDateInference.fieldId
    ? null
    : { isInferred: false, description: t`Set by an admin` };
}

/** An AI icon for an inferred value or a person for an admin's, explained on hover */
function ValueOriginIcon({ origin }: { origin: ValueOrigin | null }) {
  if (!origin) {
    return null;
  }
  return (
    <Tooltip label={origin.description} maw={280} multiline>
      <Icon
        name={origin.isInferred ? "ai" : "person"}
        c="text-secondary"
        aria-label={origin.description}
        flex="0 0 auto"
      />
    </Tooltip>
  );
}

/** The review or revert action that applies to the role */
function RoleNote({ structure, disabled, onChange }: RoleInputProps) {
  const { role, inference, isRoleOverridden, needsReview } = structure;
  // An admin picked the same role sync guessed, so there's nothing to revert to
  const isConfirmedGuess = isRoleOverridden && role === inference.role;

  return (
    <>
      {needsReview && (
        <Badge color="warning" variant="light">
          {t`Needs review`}
        </Badge>
      )}
      {!disabled && isRoleOverridden && !isConfirmedGuess && inference.role && (
        <Button
          size="compact-sm"
          variant="subtle"
          px={0}
          classNames={NOTE_ACTION_CLASS_NAMES}
          onClick={() => onChange(null)}
        >
          {t`Use the inferred role (${getTableRoleLabel(inference.role)})`}
        </Button>
      )}
      {!disabled && needsReview && inference.role && (
        <Button
          size="compact-sm"
          variant="subtle"
          px={0}
          classNames={NOTE_ACTION_CLASS_NAMES}
          onClick={() => onChange(inference.role)}
        >
          {t`Yes, this table's role is ${getTableRoleLabel(inference.role)}`}
        </Button>
      )}
    </>
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

/** The date the table is trended by; clearing it says the table has none */
function MainDateSelect({
  fields,
  structure,
  disabled,
  onChange,
}: MainDateInputProps & { fields: Field[] }) {
  return (
    <FieldSelect
      label={t`Main date`}
      fields={fields.filter((field) => isDate(field))}
      value={getMainDateFieldId(structure)}
      placeholder={t`No main date`}
      clearable
      disabled={disabled}
      onChange={onChange}
    />
  );
}

/** The revert action for the main date, when it applies */
function MainDateNote({ structure, disabled, onChange }: MainDateInputProps) {
  const { mainDateInference, isMainDateOverridden } = structure;
  // An admin picked the same date sync guessed, so there's nothing to revert to
  const isConfirmedGuess =
    isMainDateOverridden &&
    getMainDateFieldId(structure) === mainDateInference.fieldId;

  return (
    <>
      {!disabled && isMainDateOverridden && !isConfirmedGuess && (
        <Button
          size="compact-sm"
          variant="subtle"
          px={0}
          classNames={NOTE_ACTION_CLASS_NAMES}
          onClick={() => onChange(undefined)}
        >
          {t`Use the inferred main date`}
        </Button>
      )}
    </>
  );
}

function FieldSelect({
  label,
  fields,
  value,
  placeholder = t`Choose a column`,
  clearable,
  disabled,
  onChange,
}: {
  label: string;
  fields: Field[];
  value: FieldId | null;
  placeholder?: string;
  clearable?: boolean;
  disabled: boolean;
  onChange: (fieldId: FieldId | null) => void;
}) {
  return (
    <Select
      aria-label={label}
      classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
      data={fields.map((field) => ({
        value: String(getRawTableFieldId(field)),
        label: field.display_name,
      }))}
      value={value != null ? String(value) : null}
      placeholder={placeholder}
      searchable
      clearable={clearable}
      allowDeselect={clearable}
      disabled={disabled}
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
