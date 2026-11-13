import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { type ReactNode, useRef, useState } from "react";
import { t } from "ttag";

import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { useDataLayers } from "metabase/metadata/data-layers";
import {
  type HistoryBinding,
  type ScdDetailsOverrides,
  type TableStructure as TableStructureValue,
  getHistoryShape,
  getPeriodGranularityOptions,
  getRowIdentityLabel,
  getScdTypeForHistoryShape,
  getTableHiddenReason,
  getTableRoleLabel,
  getTableRoleOptions,
  getTableRoleRowDescription,
  isRoleA,
  isTableRole,
  useTableStructures,
} from "metabase/metadata/table-structure";
import {
  Box,
  Button,
  Icon,
  MultiSelect,
  Select,
  Stack,
  Text,
  TextInput,
  Transition,
  type TransitionProps,
} from "metabase/ui";
import { isDate } from "metabase-lib/v1/types/utils/isa";
import type { Field, FieldId, Table } from "metabase-types/api";

import {
  DETAILS_CELL_INPUT_CLASS_NAMES,
  DetailsEditableText,
} from "../../DetailPanel";
import {
  ColumnSelect,
  InfoIcon,
  LabelWithInfo,
} from "../../FieldDetailsPanel/ChangesOverTime";
import { CustomPropertiesSection } from "../CustomProperties/CustomPropertiesSection";
import { EntityCustomPropertiesSection } from "../CustomProperties/EntityCustomPropertiesSection";
import { InferredValue } from "../InferenceReview";
import {
  CurrentTableSelect,
  CurrentValueFieldsInput,
  FactKeyList,
  HistoryChecksStatus,
  HistoryShapeValue,
  HistoryVersionsSummary,
  PreviousValuesSection,
  SharedPointerNote,
  getHistoryShapeInference,
  getValidToForDates,
  useHistoryExampleSource,
  useScdDetails,
} from "../TableHistory";

import S from "./TableStructure.module.css";

interface TableStructureProps {
  table: Table;
  readOnly: boolean;
}

/**
 * PROTOTYPE: mocked. A table's role and grain, plus the history or custom
 * property binding its role needs. Inferred in the browser and overridable.
 */
export function TableStructure({
  table,
  readOnly,
  hasTitle = true,
  layout = "table",
}: TableStructureProps & {
  /** Off drops the "Structure" heading, for a page that names the section */
  hasTitle?: boolean;
  /** A details table for the drawer, or labelled form fields for a page */
  layout?: "table" | "form";
}) {
  const {
    getTableStructure,
    setTableRole,
    setGrainDescription,
    setPeriodGranularity,
    setEavBinding,
    setMainDate,
    setHistoryBinding,
  } = useTableStructures();
  const structure = getTableStructure(table);
  const fields = table.fields ?? [];
  const { role } = structure;
  const isHistoryRole = role != null && isRoleA(role, "role/HistoryDimension");
  const historyInfo = getHistoryFieldInfo();
  const { getTableDataLayer } = useDataLayers();
  const hiddenReason = getTableHiddenReason({
    table,
    role,
    dataLayer: getTableDataLayer(table.db_id, table.schema, table.id).layer,
  });

  const structureSectionRef = useRef<HTMLDivElement>(null);

  // Leaves room below the Structure heading for the section that just appeared
  const scrollStructureToTop = () => {
    requestAnimationFrame(() => {
      structureSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const structureTable = (
    <DetailsTable>
      <DetailsRow
        label={t`Role`}
        fillValue
        value={
          <RoleValue
            structure={structure}
            disabled={readOnly}
            onChange={(role) => setTableRole(table, role)}
          />
        }
      />
      {isHistoryRole && (
        <DetailsRow
          label={t`Matched on`}
          labelAside={<InfoIcon info={historyInfo.matchedOn} />}
          fillValue
          value={
            <ColumnSelect
              label={t`Matched on`}
              fields={fields}
              value={structure.history.durableKeyFieldId}
              disabled={readOnly}
              onChange={(durableKeyFieldId) =>
                setHistoryBinding(table, { durableKeyFieldId })
              }
            />
          }
        />
      )}
      {isHistoryRole && (
        <DetailsRow
          label={t`Start date`}
          labelAside={<InfoIcon info={historyInfo.trueFrom} />}
          fillValue
          value={
            <ColumnSelect
              label={t`Start date`}
              fields={fields}
              value={structure.history.validFromFieldId}
              disabled={readOnly}
              onChange={(validFromFieldId) =>
                setHistoryBinding(table, { validFromFieldId })
              }
            />
          }
        />
      )}
      {isHistoryRole && (
        <DetailsRow
          label={t`End date`}
          labelAside={<InfoIcon info={historyInfo.trueUntil} />}
          fillValue
          value={
            <ColumnSelect
              label={t`End date`}
              fields={fields}
              value={structure.history.validToFieldId}
              placeholder={t`None: ends when the next version starts`}
              clearable
              disabled={readOnly}
              onChange={(validToFieldId) =>
                setHistoryBinding(table, { validToFieldId })
              }
            />
          }
        />
      )}
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
        fillValue
        value={
          <GrainSelect
            table={table}
            grainFields={structure.grainFields}
            disabled={readOnly}
            layout="table"
          />
        }
      />
      <DetailsRow
        label={t`Row identity`}
        value={getRowIdentityLabel(structure.rowIdentity)}
      />
      {!isHistoryRole && (
        <DetailsRow
          label={t`Main date`}
          fillValue
          value={
            <MainDateValue
              fields={fields}
              structure={structure}
              disabled={readOnly}
              onChange={(fieldId) => setMainDate(table, fieldId)}
            />
          }
        />
      )}
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
  );

  return (
    <>
      <Box ref={structureSectionRef} className={S.structureSection}>
        {layout === "form" && (
          <StructureForm
            table={table}
            structure={structure}
            readOnly={readOnly}
          />
        )}
        {layout === "table" && hasTitle && (
          <SidebarSection title={t`Structure`}>{structureTable}</SidebarSection>
        )}
        {layout === "table" && !hasTitle && structureTable}
      </Box>

      <PreviousValuesSection table={table} disabled={readOnly} />

      <RevealTransition
        key={table.id}
        mounted={role != null && isRoleA(role, "role/CustomPropertyTable")}
        onReveal={scrollStructureToTop}
      >
        <CustomPropertiesSection
          table={table}
          disabled={readOnly}
          onChange={(eav) => setEavBinding(table, eav)}
        />
      </RevealTransition>

      <EntityCustomPropertiesSection table={table} />
    </>
  );
}

export function useIsHistoryTable(table: Table) {
  const { role } = useTableStructures().getTableStructure(table);
  return role != null && isRoleA(role, "role/HistoryDimension");
}

export function TableHistorySection({ table, readOnly }: TableStructureProps) {
  const { getTableStructure, setHistoryBinding, setScdType, setScdDetails } =
    useTableStructures();

  return (
    <HistoryBindingSection
      table={table}
      fields={table.fields ?? []}
      structure={getTableStructure(table)}
      disabled={readOnly}
      onChange={(history) => setHistoryBinding(table, history)}
      onScdTypeChange={(scdType) => setScdType(table, scdType)}
      onScdDetailsChange={(scdDetails) => setScdDetails(table, scdDetails)}
    />
  );
}

const REVEAL_TRANSITION = {
  in: { opacity: 1, transform: "translateY(0)" },
  out: { opacity: 0, transform: "translateY(-0.5rem)" },
  transitionProperty: "opacity, transform",
} satisfies TransitionProps["transition"];

const REVEAL_DURATION_MS = 250;

/**
 * Fades and slides its content in, then briefly highlights it, when `mounted`
 * turns true. Content that's mounted from the start appears without animating
 * and doesn't call `onReveal`.
 */
function RevealTransition({
  mounted,
  onReveal,
  children,
}: {
  mounted: boolean;
  onReveal?: () => void;
  children: ReactNode;
}) {
  const [isHighlighted, setIsHighlighted] = useState(false);

  return (
    <Transition
      mounted={mounted}
      transition={REVEAL_TRANSITION}
      duration={REVEAL_DURATION_MS}
      timingFunction="ease-out"
      onEnter={() => {
        setIsHighlighted(true);
        onReveal?.();
      }}
      onExited={() => setIsHighlighted(false)}
    >
      {(style) => (
        <Box
          style={style}
          className={cx(S.reveal, { [S.highlighted]: isHighlighted })}
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) {
              setIsHighlighted(false);
            }
          }}
        >
          {children}
        </Box>
      )}
    </Transition>
  );
}

type RoleInputProps = {
  structure: TableStructureValue;
  disabled: boolean;
  onChange: (role: TableStructureValue["role"]) => void;
};

/** Sync's role, until an admin confirms or changes it; no role isn't a guess */
function isRoleInferred({ isRoleOverridden, inference }: TableStructureValue) {
  return !isRoleOverridden && inference.role != null;
}

/** The role, or sync's guess to confirm or change */
function RoleValue({ structure, disabled, onChange }: RoleInputProps) {
  const [isSelectOpenOnMount, setIsSelectOpenOnMount] = useState(false);
  const { inference } = structure;

  if (isRoleInferred(structure) && inference.role) {
    const inferredRole = inference.role;
    return (
      <InferredValue
        value={getTableRoleLabel(inferredRole)}
        inference={getRoleInference(structure)}
        readOnly={disabled}
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
  return isRoleOverridden ? null : inference.signal;
}

/** What a history table's key and dates mean, for their info icons */
function getHistoryFieldInfo() {
  return {
    matchedOn: t`The column that says which record each row is a version of.`,
    trueFrom: t`The date this version of the record became true.`,
    trueUntil: t`Optional. The date this version stopped being true. If it's empty, each version is true until the next one starts.`,
  };
}

const toFieldOption = (field: Field) => ({
  value: String(field.id),
  label: field.display_name,
});

const toFieldValue = (fields: Field[], fieldId: FieldId | null) =>
  fields.some((field) => field.id === fieldId) ? String(fieldId) : null;

const toFieldId = (value: string | null) =>
  value != null ? Number(value) : null;

/**
 * The structure settings as labelled form fields, for a page: no read-only
 * rows that the page already shows elsewhere
 */
function StructureForm({
  table,
  structure,
  readOnly,
}: {
  table: Table;
  structure: TableStructureValue;
  readOnly: boolean;
}) {
  const {
    setTableRole,
    setGrainDescription,
    setPeriodGranularity,
    setMainDate,
    setHistoryBinding,
  } = useTableStructures();
  const fields = table.fields ?? [];
  const dateFields = fields.filter((field) => isDate(field));
  const { role, history } = structure;
  const isHistoryRole = role != null && isRoleA(role, "role/HistoryDimension");
  const historyInfo = getHistoryFieldInfo();

  return (
    <Stack gap="xxl">
      <Select
        label={t`Role`}
        description={getRoleInference(structure)}
        data={getTableRoleOptions()}
        value={role}
        placeholder={t`Choose a role`}
        searchable
        allowDeselect={false}
        disabled={readOnly}
        onChange={(value) => {
          if (isTableRole(value)) {
            setTableRole(table, value);
          }
        }}
      />
      {isHistoryRole && (
        <>
          <Select
            label={
              <LabelWithInfo
                label={t`Matched on`}
                info={historyInfo.matchedOn}
              />
            }
            data={fields.map(toFieldOption)}
            value={toFieldValue(fields, history.durableKeyFieldId)}
            placeholder={t`Choose a column`}
            disabled={readOnly}
            onChange={(value) =>
              setHistoryBinding(table, { durableKeyFieldId: toFieldId(value) })
            }
          />
          <Select
            label={
              <LabelWithInfo
                label={t`Start date`}
                info={historyInfo.trueFrom}
              />
            }
            data={fields.map(toFieldOption)}
            value={toFieldValue(fields, history.validFromFieldId)}
            placeholder={t`Choose a column`}
            disabled={readOnly}
            onChange={(value) =>
              setHistoryBinding(table, { validFromFieldId: toFieldId(value) })
            }
          />
          <Select
            label={
              <LabelWithInfo label={t`End date`} info={historyInfo.trueUntil} />
            }
            data={fields.map(toFieldOption)}
            value={toFieldValue(fields, history.validToFieldId)}
            description={t`Optional. Leave it empty if each version ends when the next one starts.`}
            placeholder={t`None: ends when the next version starts`}
            clearable
            disabled={readOnly}
            onChange={(value) =>
              setHistoryBinding(table, { validToFieldId: toFieldId(value) })
            }
          />
        </>
      )}
      <GrainDescriptionInput
        key={structure.grainDescription}
        value={structure.grainDescription}
        placeholder={
          role ? getTableRoleRowDescription(role) : t`Describe one row`
        }
        disabled={readOnly}
        onCommit={(value) => setGrainDescription(table, value)}
      />
      <GrainSelect
        table={table}
        grainFields={structure.grainFields}
        disabled={readOnly}
        layout="form"
      />
      {!isHistoryRole && (
        <Select
          label={t`Main date`}
          description={getMainDateInference(structure)}
          data={dateFields.map(toFieldOption)}
          value={toFieldValue(dateFields, getMainDateFieldId(structure))}
          placeholder={t`No main date`}
          clearable
          disabled={readOnly}
          onChange={(value) => setMainDate(table, toFieldId(value))}
        />
      )}
      {role && isRoleA(role, "role/PeriodicSnapshotFact") && (
        <Select
          label={t`Period`}
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
      )}
    </Stack>
  );
}

/** Saves on blur or Enter */
function GrainDescriptionInput({
  value,
  placeholder,
  disabled,
  onCommit,
}: {
  value: string;
  placeholder: string;
  disabled: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <TextInput
      label={t`Each row is`}
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={() => {
        if (draft.trim() !== value) {
          onCommit(draft.trim());
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
    />
  );
}

/** Why sync picked the main date; nothing once an admin has set it */
function getMainDateInference({
  mainDateInference,
  isMainDateOverridden,
}: TableStructureValue): string | null {
  return isMainDateOverridden ? null : mainDateInference.signal;
}

function GrainSelect({
  table,
  grainFields,
  disabled,
  layout,
}: {
  table: Table;
  grainFields: Field[];
  disabled: boolean;
  layout: "table" | "form";
}) {
  const { setTableGrain } = useTableStructures();
  const fields = table.fields ?? [];

  return (
    <MultiSelect
      label={layout === "form" ? t`Grain` : undefined}
      description={
        layout === "form"
          ? t`The columns that together make each row unique.`
          : undefined
      }
      aria-label={t`Grain`}
      classNames={
        layout === "table" ? DETAILS_CELL_INPUT_CLASS_NAMES : undefined
      }
      data={fields.map(toFieldOption)}
      value={grainFields.map((field) => String(field.id))}
      placeholder={grainFields.length === 0 ? t`Choose columns` : undefined}
      searchable
      disabled={disabled}
      onChange={(values) => setTableGrain(table, values.map(Number))}
    />
  );
}

type MainDateInputProps = {
  structure: TableStructureValue;
  disabled: boolean;
  onChange: (fieldId: FieldId | null | undefined) => void;
};

function getMainDateFieldId({ mainDateField }: TableStructureValue) {
  return mainDateField ? mainDateField.id : null;
}

/** Sync's main date, until an admin confirms or changes it; none isn't a guess */
function isMainDateInferred({
  isMainDateOverridden,
  mainDateField,
}: TableStructureValue) {
  return !isMainDateOverridden && mainDateField != null;
}

/** The main date, or sync's guess to confirm or change */
function MainDateValue({
  fields,
  structure,
  disabled,
  onChange,
}: MainDateInputProps & { fields: Field[] }) {
  const [isSelectOpenOnMount, setIsSelectOpenOnMount] = useState(false);
  const inferredFieldId = structure.mainDateInference.fieldId;

  if (isMainDateInferred(structure) && structure.mainDateField) {
    return (
      <InferredValue
        // Not overridden, so the current main date is the inferred one
        value={structure.mainDateField.display_name}
        inference={getMainDateInference(structure)}
        readOnly={disabled}
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
        const fieldId = field.id;
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

function CurrentFlagSelect({
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
    <FieldSelect
      label={t`Current flag`}
      fields={fields}
      value={binding.currentFlagFieldId}
      placeholder={t`No current flag`}
      clearable
      disabled={disabled}
      onChange={(currentFlagFieldId) => onChange({ currentFlagFieldId })}
    />
  );
}

function HistoryBindingSection({
  table,
  fields,
  structure,
  disabled,
  onChange,
  onScdTypeChange,
  onScdDetailsChange,
}: {
  table: Table;
  fields: Field[];
  structure: TableStructureValue;
  disabled: boolean;
  onChange: (binding: Partial<HistoryBinding>) => void;
  onScdTypeChange: (scdType: TableStructureValue["scdType"]) => void;
  onScdDetailsChange: (scdDetails: ScdDetailsOverrides) => void;
}) {
  const binding = structure.history;
  const scd = useScdDetails(table);
  const shape = getHistoryShape(
    scd.resolution.scdType,
    binding.validToFieldId != null,
  );
  const shapeInference = getHistoryShapeInference(scd);
  const exampleSource = useHistoryExampleSource(table, scd);
  const [isAdvancedOpen, { toggle: toggleAdvanced }] = useDisclosure(false);
  const hasCurrentFlag = binding.currentFlagFieldId != null;

  return (
    <SidebarSection title={t`History`}>
      <DetailsTable>
        <DetailsRow
          label={t`History`}
          fillValue
          value={
            <HistoryShapeValue
              shape={shape}
              inference={shapeInference}
              isInferred={!scd.resolution.isOverridden}
              hasDateRange={getValidToForDates(fields, binding) != null}
              exampleSource={exampleSource}
              disabled={disabled}
              onConfirm={() => onScdTypeChange(scd.resolution.scdType)}
              onChange={(shape) => {
                onScdTypeChange(getScdTypeForHistoryShape(shape));
                if (shape === "latest-row-per-key") {
                  onChange({ validToFieldId: null });
                }
                if (shape === "versions-with-dates") {
                  onChange({
                    validToFieldId: getValidToForDates(fields, binding),
                  });
                }
              }}
            />
          }
        />
        {shape === "current-table" && (
          <DetailsRow
            label={t`Current table`}
            fillValue
            value={
              <CurrentTableSelect
                tables={scd.otherTables}
                value={scd.currentTable}
                disabled={disabled}
                onChange={(currentTableId) =>
                  onScdDetailsChange({ currentTableId })
                }
              />
            }
          />
        )}
        {shape === "current-values" && (
          <DetailsRow
            label={t`Current values`}
            fillValue
            value={
              <CurrentValueFieldsInput
                fields={fields}
                value={scd.currentValueFields}
                disabled={disabled}
                onChange={(currentValueFieldIds) =>
                  onScdDetailsChange({ currentValueFieldIds })
                }
              />
            }
          />
        )}
        {shape === "fact-key" && (
          <DetailsRow
            label={t`Facts join on`}
            value={<FactKeyList factKeyFields={scd.factKeyFields} />}
          />
        )}
        <DetailsRow
          label={t`Entity key`}
          fillValue
          value={
            <FieldSelect
              label={t`Entity key`}
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
            <Stack gap={0} w="100%">
              <FieldSelect
                label={t`Valid from`}
                fields={fields}
                value={binding.validFromFieldId}
                disabled={disabled}
                onChange={(validFromFieldId) => onChange({ validFromFieldId })}
              />
              <SharedPointerNote structure={structure} fields={fields} />
            </Stack>
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
              placeholder={t`No valid to`}
              clearable
              disabled={disabled}
              onChange={(validToFieldId) => onChange({ validToFieldId })}
            />
          }
        />
        {hasCurrentFlag && (
          <DetailsRow
            label={t`Current flag`}
            fillValue
            value={
              <CurrentFlagSelect
                fields={fields}
                binding={binding}
                disabled={disabled}
                onChange={onChange}
              />
            }
          />
        )}
        <DetailsRow
          label={t`Versions`}
          value={<HistoryVersionsSummary table={table} />}
        />
        <DetailsRow
          label={t`Checks`}
          value={<HistoryChecksStatus table={table} />}
        />
      </DetailsTable>
      <Button
        variant="subtle"
        size="compact-sm"
        px={0}
        w="fit-content"
        c="text-secondary"
        leftSection={
          <Icon name={isAdvancedOpen ? "chevrondown" : "chevronright"} />
        }
        aria-expanded={isAdvancedOpen}
        onClick={toggleAdvanced}
      >
        {t`Advanced`}
      </Button>
      {isAdvancedOpen && (
        <DetailsTable>
          {!hasCurrentFlag && (
            <DetailsRow
              label={t`Current flag`}
              fillValue
              value={
                <CurrentFlagSelect
                  fields={fields}
                  binding={binding}
                  disabled={disabled}
                  onChange={onChange}
                />
              }
            />
          )}
          <DetailsRow
            label={t`Version`}
            fillValue
            value={
              <FieldSelect
                label={t`Version`}
                fields={fields}
                value={binding.versionFieldId}
                placeholder={t`No version column`}
                clearable
                disabled={disabled}
                onChange={(versionFieldId) => onChange({ versionFieldId })}
              />
            }
          />
        </DetailsTable>
      )}
    </SidebarSection>
  );
}
