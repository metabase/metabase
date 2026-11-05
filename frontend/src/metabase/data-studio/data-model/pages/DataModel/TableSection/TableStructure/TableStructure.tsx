import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { type ReactNode, useRef, useState } from "react";
import { t } from "ttag";

import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { Link } from "metabase/common/components/Link";
import { useDataLayers } from "metabase/metadata/data-layers";
import {
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
  Box,
  Button,
  Group,
  Pill,
  Select,
  Stack,
  Text,
  Transition,
  type TransitionProps,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { isDate } from "metabase-lib/v1/types/utils/isa";
import type { Field, FieldId, Table } from "metabase-types/api";

import {
  DETAILS_CELL_INPUT_CLASS_NAMES,
  DetailsEditableText,
} from "../../DetailPanel";
import { CustomPropertiesSection } from "../CustomProperties/CustomPropertiesSection";
import { EntityCustomPropertiesSection } from "../CustomProperties/EntityCustomPropertiesSection";
import {
  InferredIcon,
  NeedsReviewBadge,
  ReviewValue,
} from "../InferenceReview";
import {
  HistoryChecksStatus,
  HistoryIntro,
  HistoryKindInput,
  HistoryVersionsSummary,
  SharedPointerNote,
  getValidToForDates,
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
export function TableStructure({ table, readOnly }: TableStructureProps) {
  const {
    getTableStructure,
    setTableRole,
    setGrainDescription,
    setPeriodGranularity,
    setHistoryBinding,
    setScdType,
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

  return (
    <>
      <Box ref={structureSectionRef} className={S.structureSection}>
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
                    role
                      ? getTableRoleRowDescription(role)
                      : t`Describe one row`
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
                <GrainFields
                  table={table}
                  grainFields={structure.grainFields}
                />
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
      </Box>

      {role && isRoleA(role, "role/HistoryDimension") && (
        <HistoryBindingSection
          table={table}
          fields={fields}
          structure={structure}
          disabled={readOnly}
          onChange={(history) => setHistoryBinding(table, history)}
          onScdTypeChange={(scdType) => setScdType(table, scdType)}
        />
      )}

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

/** A weak guess an admin can act on: shown as text to confirm or change */
function isRoleUnderReview(
  { needsReview, inference }: TableStructureValue,
  disabled: boolean,
) {
  return needsReview && !disabled && inference.role != null;
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
}: {
  table: Table;
  fields: Field[];
  structure: TableStructureValue;
  disabled: boolean;
  onChange: (binding: Partial<HistoryBinding>) => void;
  onScdTypeChange: (scdType: TableStructureValue["scdType"]) => void;
}) {
  const binding = structure.history;
  const [isAdvancedOpen, { toggle: toggleAdvanced }] = useDisclosure(false);
  const hasCurrentFlag = binding.currentFlagFieldId != null;
  const showAdvancedLabel = hasCurrentFlag
    ? t`Show version`
    : t`Show current flag and version`;
  const hideAdvancedLabel = hasCurrentFlag
    ? t`Hide version`
    : t`Hide current flag and version`;

  return (
    <SidebarSection title={t`History`}>
      <HistoryIntro structure={structure} />
      <DetailsTable>
        <DetailsRow
          label={t`History`}
          value={
            <HistoryKindInput
              structure={structure}
              fields={fields}
              disabled={disabled}
              onConfirmGuess={() =>
                onScdTypeChange(structure.scdTypeInference.scdType)
              }
              onChange={(kind) => {
                onScdTypeChange(2);
                onChange({
                  validToFieldId:
                    kind === "latest-row-per-key"
                      ? null
                      : getValidToForDates(fields, binding),
                });
              }}
            />
          }
        />
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
        <DetailsRow
          label={t`Advanced`}
          value={
            <Button
              size="compact-sm"
              variant="subtle"
              px={0}
              onClick={toggleAdvanced}
            >
              {isAdvancedOpen ? hideAdvancedLabel : showAdvancedLabel}
            </Button>
          }
        />
        {isAdvancedOpen && !hasCurrentFlag && (
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
        {isAdvancedOpen && (
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
        )}
      </DetailsTable>
    </SidebarSection>
  );
}
