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
  Badge,
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

import { DetailsEditableText } from "../../DetailPanel";
import { CustomPropertiesSection } from "../CustomProperties/CustomPropertiesSection";
import { EntityCustomPropertiesSection } from "../CustomProperties/EntityCustomPropertiesSection";
import {
  CurrentRuleHint,
  DefaultSegmentInput,
  HistoryIntro,
  HistoryKindInput,
  HistoryVersionsSummary,
  SharedPointerNote,
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
              value={
                <RoleInput
                  structure={structure}
                  disabled={readOnly}
                  onChange={(role) => setTableRole(table, role)}
                />
              }
            />
            <DetailsRow
              label={t`Each row is`}
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
              value={
                <MainDateInput
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
                value={
                  <Select
                    aria-label={t`Period`}
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

function RoleInput({
  structure,
  disabled,
  onChange,
}: {
  structure: TableStructureValue;
  disabled: boolean;
  onChange: (role: TableStructureValue["role"]) => void;
}) {
  const { role, inference, isRoleOverridden, needsReview } = structure;
  // An admin picked the same role sync guessed, so there's nothing to revert to
  const isConfirmedGuess = isRoleOverridden && role === inference.role;

  return (
    <Stack gap="xs" py="xs">
      {needsReview && (
        <Badge color="warning" variant="light" w="fit-content">
          {t`Needs review`}
        </Badge>
      )}
      <Select
        aria-label={t`Role`}
        data={getTableRoleOptions()}
        value={role}
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
      <Text size="sm" c="text-secondary">
        {!isRoleOverridden
          ? t`Inferred: ${inference.signal}`
          : isConfirmedGuess
            ? t`Confirmed by an admin`
            : t`Set by an admin`}
      </Text>
      {!disabled && isRoleOverridden && !isConfirmedGuess && inference.role && (
        <Button
          size="compact-sm"
          variant="subtle"
          w="fit-content"
          px={0}
          onClick={() => onChange(null)}
        >
          {t`Use the inferred role (${getTableRoleLabel(inference.role)})`}
        </Button>
      )}
      {!disabled && needsReview && inference.role && (
        <Button
          size="compact-sm"
          variant="subtle"
          w="fit-content"
          px={0}
          onClick={() => onChange(inference.role)}
        >
          {t`Yes, this table's role is ${getTableRoleLabel(inference.role)}`}
        </Button>
      )}
    </Stack>
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

/** The date the table is trended by; clearing it says the table has none */
function MainDateInput({
  fields,
  structure,
  disabled,
  onChange,
}: {
  fields: Field[];
  structure: TableStructureValue;
  disabled: boolean;
  onChange: (fieldId: FieldId | null | undefined) => void;
}) {
  const { mainDateField, mainDateInference, isMainDateOverridden } = structure;
  const mainDateFieldId = mainDateField
    ? getRawTableFieldId(mainDateField)
    : null;
  // An admin picked the same date sync guessed, so there's nothing to revert to
  const isConfirmedGuess =
    isMainDateOverridden && mainDateFieldId === mainDateInference.fieldId;

  return (
    <Stack gap="xs" py="xs">
      <FieldSelect
        label={t`Main date`}
        fields={fields.filter((field) => isDate(field))}
        value={mainDateFieldId}
        placeholder={t`No main date`}
        clearable
        disabled={disabled}
        onChange={onChange}
      />
      <Text size="sm" c="text-secondary">
        {!isMainDateOverridden
          ? t`Inferred: ${mainDateInference.signal}`
          : isConfirmedGuess
            ? t`Confirmed by an admin`
            : t`Set by an admin`}
      </Text>
      {!disabled && isMainDateOverridden && !isConfirmedGuess && (
        <Button
          size="compact-sm"
          variant="subtle"
          w="fit-content"
          px={0}
          onClick={() => onChange(undefined)}
        >
          {t`Use the inferred main date`}
        </Button>
      )}
    </Stack>
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
              disabled={disabled}
              onConfirmGuess={() =>
                onScdTypeChange(structure.scdTypeInference.scdType)
              }
              onChange={(kind) => {
                onScdTypeChange(2);
                if (kind === "latest-row-per-key") {
                  onChange({ validToFieldId: null });
                }
              }}
            />
          }
        />
        <DetailsRow
          label={t`Entity key`}
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
          value={
            <Stack gap="xs" py="xs">
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
          value={
            <Stack gap="xs" py="xs">
              <FieldSelect
                label={t`Valid to`}
                fields={fields}
                value={binding.validToFieldId}
                placeholder={t`No valid to`}
                clearable
                disabled={disabled}
                onChange={(validToFieldId) => onChange({ validToFieldId })}
              />
              {!hasCurrentFlag && (
                <CurrentRuleHint
                  table={table}
                  structure={structure}
                  fields={fields}
                />
              )}
            </Stack>
          }
        />
        {hasCurrentFlag && (
          <DetailsRow
            label={t`Current flag`}
            value={
              <Stack gap="xs" py="xs">
                <CurrentFlagSelect
                  fields={fields}
                  binding={binding}
                  disabled={disabled}
                  onChange={onChange}
                />
                <CurrentRuleHint
                  table={table}
                  structure={structure}
                  fields={fields}
                />
              </Stack>
            }
          />
        )}
        <DetailsRow
          label={t`Default filter`}
          value={
            <DefaultSegmentInput
              structure={structure}
              fields={fields}
              disabled={disabled}
              onChange={(currentRowsOnly) => onChange({ currentRowsOnly })}
            />
          }
        />
        <DetailsRow
          label={t`Versions`}
          value={<HistoryVersionsSummary table={table} />}
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
