import { useState } from "react";
import { t } from "ttag";

import type { DefaultSegment } from "metabase/metadata/table-segments";
import { FilterPickerBody } from "metabase/querying/filters/components/FilterPicker/FilterPickerBody";
import { Icon, Input, Menu, Popover, Select, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Segment, Table } from "metabase-types/api";

import { InferredValue } from "../InferenceReview";
import {
  type ResolvedDefaultSegment,
  type ResolvedSystemSegment,
  type TableSegmentsModel,
  useTableSegmentsModel,
} from "../table-segments";

import S from "./TableFiltering.module.css";

const STAGE_INDEX = -1;

const BUTTON_INPUT_CLASS_NAMES = { input: S.buttonInput };

interface TableSettingProps {
  table: Table;
  readOnly: boolean;
}

/** PROTOTYPE: mocked. The segment a table's questions start from */
export function TableDefaultSegment({ table, readOnly }: TableSettingProps) {
  const model = useTableSegmentsModel(table);

  return (
    <Input.Wrapper
      label={t`Default segment`}
      description={t`Questions on this table start from this segment. People can remove it from a question.`}
    >
      <DefaultSegmentValue
        model={model}
        customSegments={table.segments ?? []}
        disabled={readOnly}
      />
    </Input.Wrapper>
  );
}

/**
 * PROTOTYPE: mocked. The column every question on a table must filter on
 * before it runs, and the value that filter starts with
 */
export function TableRequiredFilter({ table, readOnly }: TableSettingProps) {
  const model = useTableSegmentsModel(table);
  return <RequiredFilterFields model={model} disabled={readOnly} />;
}

/** Why sync picked the default segment; nothing once an admin has set it */
function getDefaultInference({
  inference,
  isOverridden,
}: ResolvedDefaultSegment): string | null {
  return isOverridden ? null : t`Inferred: ${inference.signal}`;
}

function isSameSegment(a: DefaultSegment, b: DefaultSegment): boolean {
  return (
    a.type === b.type &&
    (a.type !== "system" || b.type !== "system" || a.role === b.role) &&
    (a.type !== "custom" || b.type !== "custom" || a.segmentId === b.segmentId)
  );
}

/** Sync's default segment, until an admin sets one; "All records" isn't a guess */
function isDefaultSegmentInferred({
  inference,
  isOverridden,
}: ResolvedDefaultSegment): boolean {
  return !isOverridden && inference.segment.type !== "all";
}

/** The default segment, or sync's guess to confirm or change */
function DefaultSegmentValue({
  model,
  customSegments,
  disabled,
}: {
  model: TableSegmentsModel;
  customSegments: Segment[];
  disabled: boolean;
}) {
  const [isMenuOpenOnMount, setIsMenuOpenOnMount] = useState(false);
  const { defaultSegment, setDefaultSegment } = model;

  if (isDefaultSegmentInferred(defaultSegment)) {
    const inferredSegment = defaultSegment.inference.segment;
    return (
      <InferredValue
        value={defaultSegment.inferredLabel}
        inference={getDefaultInference(defaultSegment)}
        readOnly={disabled}
        onConfirm={() => setDefaultSegment(inferredSegment)}
        onChange={() => {
          setIsMenuOpenOnMount(true);
          setDefaultSegment(inferredSegment);
        }}
        isInset={false}
        data-testid="table-default-segment-review"
      />
    );
  }

  return (
    <DefaultSegmentPicker
      value={defaultSegment.segment}
      label={defaultSegment.label}
      systemSegments={model.systemSegments}
      customSegments={customSegments}
      disabled={disabled}
      isOpenOnMount={isMenuOpenOnMount}
      onChange={setDefaultSegment}
    />
  );
}

/**
 * The built-in choices, then "Other" for the table's own segments. "Other"
 * swaps the menu's items rather than opening a second menu.
 */
function DefaultSegmentPicker({
  value,
  label,
  systemSegments,
  customSegments,
  disabled,
  isOpenOnMount,
  onChange,
}: {
  value: DefaultSegment;
  label: string;
  /** The ones sync generated for this table */
  systemSegments: ResolvedSystemSegment[];
  customSegments: Segment[];
  disabled: boolean;
  isOpenOnMount: boolean;
  onChange: (segment: DefaultSegment) => void;
}) {
  const [isShowingCustom, setIsShowingCustom] = useState(false);
  const builtInChoices: { segment: DefaultSegment; label: string }[] = [
    { segment: { type: "all" }, label: t`All records` },
    ...systemSegments.map(({ role, label }) => ({
      segment: { type: "system" as const, role },
      label,
    })),
  ];
  const checkIfSelected = (segment: DefaultSegment) =>
    isSameSegment(segment, value) ? <Icon name="check" /> : undefined;

  return (
    <Menu
      position="bottom-start"
      width="target"
      defaultOpened={isOpenOnMount}
      disabled={disabled}
      onClose={() => setIsShowingCustom(false)}
    >
      <Menu.Target>
        <Input
          component="button"
          w="fit-content"
          miw="12rem"
          type="button"
          aria-label={t`Default segment`}
          classNames={BUTTON_INPUT_CLASS_NAMES}
          leftSection={
            value.type !== "all" ? <Icon name="segment" /> : undefined
          }
          leftSectionPointerEvents="none"
          rightSection={<Icon name="chevrondown" />}
          rightSectionPointerEvents="none"
          disabled={disabled}
          data-testid="table-default-segment-select"
        >
          {label}
        </Input>
      </Menu.Target>
      <Menu.Dropdown>
        {isShowingCustom ? (
          <>
            <Menu.Item
              leftSection={<Icon name="chevronleft" />}
              closeMenuOnClick={false}
              onClick={() => setIsShowingCustom(false)}
            >
              {t`Back`}
            </Menu.Item>
            <Menu.Divider />
            <Menu.Label>{t`Custom segments`}</Menu.Label>
            {customSegments.length === 0 ? (
              <Menu.Item disabled>{t`No custom segments yet`}</Menu.Item>
            ) : (
              customSegments.map((segment) => {
                const choice: DefaultSegment = {
                  type: "custom",
                  segmentId: segment.id,
                };
                return (
                  <Menu.Item
                    key={segment.id}
                    leftSection={<Icon name="segment" />}
                    rightSection={checkIfSelected(choice)}
                    onClick={() => onChange(choice)}
                  >
                    {segment.name}
                  </Menu.Item>
                );
              })
            )}
          </>
        ) : (
          <>
            {builtInChoices.map((choice) => (
              <Menu.Item
                key={choice.label}
                leftSection={
                  choice.segment.type === "system" ? (
                    <Icon name="segment" />
                  ) : undefined
                }
                rightSection={checkIfSelected(choice.segment)}
                onClick={() => onChange(choice.segment)}
              >
                {choice.label}
              </Menu.Item>
            ))}
            <Menu.Divider />
            <Menu.Item
              rightSection={<Icon name="chevronright" />}
              closeMenuOnClick={false}
              onClick={() => setIsShowingCustom(true)}
            >
              {value.type === "custom" ? t`Other: ${label}` : t`Other`}
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

/** A column of the table, and the id that matches it across queries */
type ColumnChoice = { fieldId: string; column: Lib.ColumnMetadata };

/** The table's own columns a filter can use, keyed by field id */
function getColumnChoices(query: Lib.Query): ColumnChoice[] {
  return Lib.filterableColumns(query, STAGE_INDEX).flatMap((column) => {
    const { isImplicitlyJoinable } = Lib.displayInfo(
      query,
      STAGE_INDEX,
      column,
    );
    const fieldId = Lib.fieldValuesSearchInfo(query, column).fieldId;
    return !isImplicitlyJoinable && fieldId != null
      ? [{ fieldId: String(fieldId), column }]
      : [];
  });
}

/**
 * The column every question must filter on, then the value that filter starts
 * with, picked with the standard filter widget for that column. A column with
 * no value yet isn't saved.
 */
function RequiredFilterFields({
  model,
  disabled,
}: {
  model: TableSegmentsModel;
  disabled: boolean;
}) {
  const { baseQuery, requiredFilter, setRequiredFilterQuery } = model;
  const savedQuery = requiredFilter.query ?? undefined;
  const savedFilter = savedQuery
    ? Lib.filters(savedQuery, STAGE_INDEX)[0]
    : undefined;
  const savedColumn =
    savedQuery && savedFilter
      ? Lib.filterParts(savedQuery, STAGE_INDEX, savedFilter)?.column
      : undefined;
  const savedFieldId =
    savedQuery && savedColumn
      ? String(Lib.fieldValuesSearchInfo(savedQuery, savedColumn).fieldId)
      : null;
  // A column picked before its value, until the value is picked
  const [pendingFieldId, setPendingFieldId] = useState<string | null>(null);
  const [isValueOpen, setIsValueOpen] = useState(false);
  const fieldId = pendingFieldId ?? savedFieldId;
  const hasSavedValue = pendingFieldId == null && savedFilter != null;
  // The value picker edits the saved filter, or starts one on the bare table
  const valueQuery = hasSavedValue ? savedQuery : baseQuery;
  const valueColumn = valueQuery
    ? getColumnChoices(valueQuery).find((choice) => choice.fieldId === fieldId)
        ?.column
    : undefined;
  const columnOptions = baseQuery
    ? getColumnChoices(baseQuery).map(({ fieldId, column }) => ({
        value: fieldId,
        label: Lib.displayInfo(baseQuery, STAGE_INDEX, column).displayName,
      }))
    : [];

  const handleColumnChange = (nextFieldId: string | null) => {
    if (nextFieldId == null) {
      setPendingFieldId(null);
      setRequiredFilterQuery(null);
    } else if (nextFieldId !== savedFieldId) {
      setPendingFieldId(nextFieldId);
      setIsValueOpen(true);
    } else {
      setPendingFieldId(null);
    }
  };

  const handleValueChange = (filter: Lib.ExpressionClause) => {
    if (hasSavedValue && savedQuery && savedFilter) {
      setRequiredFilterQuery(
        Lib.replaceClause(savedQuery, STAGE_INDEX, savedFilter, filter),
      );
    } else if (baseQuery) {
      setRequiredFilterQuery(Lib.filter(baseQuery, STAGE_INDEX, filter));
    }
    setPendingFieldId(null);
    setIsValueOpen(false);
  };

  return (
    <Stack gap="xl">
      <Select
        label={t`Column that must be filtered on`}
        description={t`Every question on this table must filter on this column before it runs.`}
        placeholder={t`No required filter`}
        data={columnOptions}
        value={fieldId}
        disabled={disabled}
        clearable
        searchable
        w="fit-content"
        miw="16rem"
        onChange={handleColumnChange}
        data-testid="table-required-filter-column"
      />
      {fieldId != null && (
        <Input.Wrapper
          label={t`Default value for this filter`}
          description={t`What the filter starts as. People can change it, but not remove it.`}
        >
          <Popover
            opened={isValueOpen}
            position="bottom-start"
            disabled={disabled || valueColumn == null}
            onChange={setIsValueOpen}
          >
            <Popover.Target>
              <Input
                component="button"
                w="fit-content"
                miw="16rem"
                mt="xs"
                type="button"
                aria-label={t`Default value for this filter`}
                classNames={BUTTON_INPUT_CLASS_NAMES}
                disabled={disabled || valueColumn == null}
                rightSection={<Icon name="chevrondown" />}
                rightSectionPointerEvents="none"
                onClick={() => setIsValueOpen((isOpen) => !isOpen)}
                data-testid="table-required-filter-value"
              >
                {hasSavedValue && requiredFilter.filterName != null ? (
                  requiredFilter.filterName
                ) : (
                  // The color inputs use for their placeholders
                  <Input.Placeholder c="text-disabled">
                    {t`Pick a value`}
                  </Input.Placeholder>
                )}
              </Input>
            </Popover.Target>
            <Popover.Dropdown p={0}>
              {valueQuery && valueColumn && (
                <FilterPickerBody
                  query={valueQuery}
                  stageIndex={STAGE_INDEX}
                  column={valueColumn}
                  filter={hasSavedValue ? savedFilter : undefined}
                  onChange={handleValueChange}
                />
              )}
            </Popover.Dropdown>
          </Popover>
        </Input.Wrapper>
      )}
    </Stack>
  );
}
