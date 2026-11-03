import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { type ReactNode, useRef, useState } from "react";
import { msgid, ngettext, t } from "ttag";

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
  usePropertyRegistry,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import {
  Badge,
  Box,
  Button,
  Code,
  Group,
  Loader,
  Select,
  Stack,
  Switch,
  Text,
  Transition,
  type TransitionProps,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { isDate } from "metabase-lib/v1/types/utils/isa";
import type { Field, FieldId, Table } from "metabase-types/api";

import { DetailsEditableText } from "../../DetailPanel";
import {
  CurrentRuleHint,
  DefaultSegmentInput,
  HistoryIntro,
  HistoryKindInput,
  HistoryVersionsSummary,
  ScdTypeSelect,
  SharedPointerNote,
  getTableHistoryKind,
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
        <EavBindingSection
          table={table}
          fields={fields}
          binding={structure.eav}
          disabled={readOnly}
          onChange={(eav) => setEavBinding(table, eav)}
        />
      </RevealTransition>
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
            <Code className={S.grainChip}>{field.name}</Code>
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
  const isHistory = getTableHistoryKind(structure) !== "not-history";

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
                if (kind === "not-history") {
                  onScdTypeChange(1);
                  return;
                }
                onScdTypeChange(2);
                if (kind === "latest-row-per-key") {
                  onChange({ validToFieldId: null });
                }
              }}
            />
          }
        />
        {isHistory && (
          <DetailsRow
            label={t`Entity key`}
            value={
              <FieldSelect
                label={t`Entity key`}
                fields={fields}
                value={binding.durableKeyFieldId}
                disabled={disabled}
                onChange={(durableKeyFieldId) =>
                  onChange({ durableKeyFieldId })
                }
              />
            }
          />
        )}
        {isHistory && (
          <DetailsRow
            label={t`Valid from`}
            value={
              <Stack gap="xs" py="xs">
                <FieldSelect
                  label={t`Valid from`}
                  fields={fields}
                  value={binding.validFromFieldId}
                  disabled={disabled}
                  onChange={(validFromFieldId) =>
                    onChange({ validFromFieldId })
                  }
                />
                <SharedPointerNote structure={structure} fields={fields} />
              </Stack>
            }
          />
        )}
        {isHistory && (
          <DetailsRow
            label={t`Valid to`}
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
        )}
        {isHistory && (
          <DetailsRow
            label={t`Current flag`}
            value={
              <Stack gap="xs" py="xs">
                <FieldSelect
                  label={t`Current flag`}
                  fields={fields}
                  value={binding.currentFlagFieldId}
                  placeholder={t`No current flag`}
                  clearable
                  disabled={disabled}
                  onChange={(currentFlagFieldId) =>
                    onChange({ currentFlagFieldId })
                  }
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
        {isHistory && (
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
        )}
        {isHistory && (
          <DetailsRow
            label={t`Versions`}
            value={<HistoryVersionsSummary table={table} />}
          />
        )}
        <DetailsRow
          label={t`Advanced`}
          value={
            <Button
              size="compact-sm"
              variant="subtle"
              px={0}
              onClick={toggleAdvanced}
            >
              {isAdvancedOpen
                ? t`Hide SCD type and version`
                : t`Show SCD type and version`}
            </Button>
          }
        />
        {isAdvancedOpen && (
          <DetailsRow
            label={t`SCD type`}
            value={
              <ScdTypeSelect
                structure={structure}
                disabled={disabled}
                onChange={onScdTypeChange}
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

function EavBindingSection({
  table,
  fields,
  binding,
  disabled,
  onChange,
}: {
  table: Table;
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
          label={t`Property field`}
          value={
            <FieldSelect
              label={t`Property field`}
              fields={fields}
              value={binding.propertyFieldId}
              disabled={disabled}
              onChange={(propertyFieldId) => onChange({ propertyFieldId })}
            />
          }
        />
        <DetailsRow
          label={t`Value field`}
          value={
            <FieldSelect
              label={t`Value field`}
              fields={fields}
              value={binding.valueFieldId}
              disabled={disabled}
              onChange={(valueFieldId) => onChange({ valueFieldId })}
            />
          }
        />
        <DetailsRow
          label={t`Changed at`}
          value={
            <FieldSelect
              label={t`Changed at`}
              fields={fields.filter((field) => isDate(field))}
              value={binding.changedAtFieldId}
              placeholder={t`No change date`}
              clearable
              disabled={disabled}
              onChange={(changedAtFieldId) => onChange({ changedAtFieldId })}
            />
          }
        />
        <DetailsRow
          label={t`Properties`}
          value={<PropertyRegistrySummary table={table} binding={binding} />}
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

function PropertyRegistrySummary({
  table,
  binding,
}: {
  table: Table;
  binding: EavBinding;
}) {
  const state = usePropertyRegistry(table, binding);
  const propertiesUrl = Urls.dataStudioData({
    databaseId: table.db_id,
    schemaName: table.schema,
    tableId: table.id,
    tab: "properties",
  });

  if (state.status === "unbound") {
    return (
      <Text c="text-secondary">{t`Pick the property and value columns`}</Text>
    );
  }
  if (state.status !== "loaded") {
    return <Loader size="xs" />;
  }

  const { properties } = state.registry;
  const attentionCount = properties.filter(
    (property) => !property.isHidden && property.signals.length > 0,
  ).length;

  return (
    <Stack gap="xs">
      <Group gap="sm" align="baseline">
        <Text c="text-primary" fw="bold">
          {ngettext(
            msgid`${properties.length} property`,
            `${properties.length} properties`,
            properties.length,
          )}
        </Text>
        {attentionCount > 0 && (
          <Badge color="warning" variant="light">
            {t`${attentionCount} need attention`}
          </Badge>
        )}
      </Group>
      <Text size="sm" c="text-secondary">
        {t`Profiled from ${state.registry.rowCount.toLocaleString()} rows about ${state.registry.entityCount.toLocaleString()} entities`}
      </Text>
      <Button
        component={Link}
        to={propertiesUrl}
        size="compact-sm"
        variant="subtle"
        w="fit-content"
        px={0}
      >
        {t`Review properties`}
      </Button>
    </Stack>
  );
}
