import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import {
  type DefaultSegment,
  SYSTEM_SEGMENT_ROLES,
  getSystemSegmentLabel,
} from "metabase/metadata/table-segments";
import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { ActionIcon, Icon, Input, Menu, Popover } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Segment, Table } from "metabase-types/api";

import { DETAILS_CELL_INPUT_CLASS_NAMES } from "../../DetailPanel";
import {
  InferredIcon,
  NeedsReviewBadge,
  ReviewValue,
} from "../InferenceReview";
import {
  type ResolvedDefaultSegment,
  type ResolvedRequiredFilter,
  type TableSegmentsModel,
  useTableSegmentsModel,
} from "../table-segments";

import S from "./TableFiltering.module.css";

const STAGE_INDEX = -1;

const BUTTON_INPUT_CLASS_NAMES = {
  ...DETAILS_CELL_INPUT_CLASS_NAMES,
  input: cx(DETAILS_CELL_INPUT_CLASS_NAMES.input, S.buttonInput),
};

interface TableFilteringProps {
  table: Table;
  readOnly: boolean;
}

/**
 * PROTOTYPE: mocked. The segment a table's questions start from, and the
 * filter every question on it must have before it runs.
 */
export function TableFiltering({ table, readOnly }: TableFilteringProps) {
  const model = useTableSegmentsModel(table);
  const { defaultSegment, requiredFilter } = model;
  const isDefaultUnderReview = defaultSegment.needsReview && !readOnly;
  const isRequiredUnderReview = requiredFilter.needsReview && !readOnly;

  return (
    <SidebarSection title={t`Filtering`}>
      <DetailsTable>
        <DetailsRow
          label={t`Default segment`}
          fillValue
          labelAside={
            isDefaultUnderReview ? (
              <NeedsReviewBadge />
            ) : (
              <InferredIcon description={getDefaultInference(defaultSegment)} />
            )
          }
          labelNote={
            // Read-only tables keep the badge here; there's no review cell
            defaultSegment.needsReview && readOnly && <NeedsReviewBadge />
          }
          value={
            <DefaultSegmentValue
              model={model}
              customSegments={table.segments ?? []}
              isUnderReview={isDefaultUnderReview}
              disabled={readOnly}
            />
          }
        />
        <DetailsRow
          label={t`Required filter`}
          fillValue
          labelAside={
            isRequiredUnderReview ? (
              <NeedsReviewBadge />
            ) : (
              <InferredIcon
                description={getRequiredInference(requiredFilter)}
              />
            )
          }
          labelNote={
            requiredFilter.needsReview && readOnly && <NeedsReviewBadge />
          }
          value={
            <RequiredFilterValue
              model={model}
              isUnderReview={isRequiredUnderReview}
              disabled={readOnly}
            />
          }
        />
      </DetailsTable>
    </SidebarSection>
  );
}

/** Why sync picked the default segment; nothing once an admin has set it */
function getDefaultInference({
  inference,
  isOverridden,
}: ResolvedDefaultSegment): string | null {
  return isOverridden ? null : t`Inferred: ${inference.signal}`;
}

function getRequiredInference({
  inference,
  isOverridden,
}: ResolvedRequiredFilter): string | null {
  return isOverridden ? null : t`Inferred: ${inference.signal}`;
}

function isSameSegment(a: DefaultSegment, b: DefaultSegment): boolean {
  return (
    a.type === b.type &&
    (a.type !== "system" || b.type !== "system" || a.role === b.role) &&
    (a.type !== "custom" || b.type !== "custom" || a.segmentId === b.segmentId)
  );
}

/** The default segment, or its weak guess to confirm or change */
function DefaultSegmentValue({
  model,
  customSegments,
  isUnderReview,
  disabled,
}: {
  model: TableSegmentsModel;
  customSegments: Segment[];
  isUnderReview: boolean;
  disabled: boolean;
}) {
  const [isMenuOpenOnMount, setIsMenuOpenOnMount] = useState(false);
  const { defaultSegment, setDefaultSegment } = model;

  if (isUnderReview) {
    const inferredSegment = defaultSegment.inference.segment;
    return (
      <ReviewValue
        value={defaultSegment.inferredLabel}
        inference={getDefaultInference(defaultSegment)}
        onConfirm={() => setDefaultSegment(inferredSegment)}
        onChange={() => {
          setIsMenuOpenOnMount(true);
          setDefaultSegment(inferredSegment);
        }}
        data-testid="table-default-segment-review"
      />
    );
  }

  return (
    <DefaultSegmentPicker
      value={defaultSegment.segment}
      label={defaultSegment.label}
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
  customSegments,
  disabled,
  isOpenOnMount,
  onChange,
}: {
  value: DefaultSegment;
  label: string;
  customSegments: Segment[];
  disabled: boolean;
  isOpenOnMount: boolean;
  onChange: (segment: DefaultSegment) => void;
}) {
  const [isShowingCustom, setIsShowingCustom] = useState(false);
  const builtInChoices: { segment: DefaultSegment; label: string }[] = [
    { segment: { type: "all" }, label: t`All records` },
    ...SYSTEM_SEGMENT_ROLES.map((role) => ({
      segment: { type: "system" as const, role },
      label: getSystemSegmentLabel(role),
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
          type="button"
          aria-label={t`Default segment`}
          classNames={BUTTON_INPUT_CLASS_NAMES}
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

/** The required filter, or its weak guess to confirm or change */
function RequiredFilterValue({
  model,
  isUnderReview,
  disabled,
}: {
  model: TableSegmentsModel;
  isUnderReview: boolean;
  disabled: boolean;
}) {
  const [isPickerOpenOnMount, setIsPickerOpenOnMount] = useState(false);
  const { requiredFilter, setRequiredFilterQuery } = model;

  if (isUnderReview) {
    const confirm = () => {
      // `undefined` while the table's metadata loads; `null` means none
      if (requiredFilter.inferredQuery !== undefined) {
        setRequiredFilterQuery(requiredFilter.inferredQuery);
      }
    };
    return (
      <ReviewValue
        value={requiredFilter.inferredFilterName ?? t`No required filter`}
        inference={getRequiredInference(requiredFilter)}
        onConfirm={confirm}
        onChange={() => {
          setIsPickerOpenOnMount(true);
          confirm();
        }}
        data-testid="table-required-filter-review"
      />
    );
  }

  return (
    <RequiredFilterPicker
      model={model}
      disabled={disabled}
      isOpenOnMount={isPickerOpenOnMount}
    />
  );
}

/**
 * Blank until set: a click opens the standard filter picker on the table's
 * columns. The ✕ clears it.
 */
function RequiredFilterPicker({
  model,
  disabled,
  isOpenOnMount,
}: {
  model: TableSegmentsModel;
  disabled: boolean;
  isOpenOnMount: boolean;
}) {
  const [isOpen, setIsOpen] = useState(isOpenOnMount);
  const { baseQuery, requiredFilter, setRequiredFilterQuery } = model;
  const filterQuery = requiredFilter.query ?? baseQuery;
  const filter = requiredFilter.query
    ? Lib.filters(requiredFilter.query, STAGE_INDEX)[0]
    : undefined;

  const handleSelect = (newFilter: Lib.Filterable) => {
    if (requiredFilter.query && filter) {
      setRequiredFilterQuery(
        Lib.replaceClause(requiredFilter.query, STAGE_INDEX, filter, newFilter),
      );
    } else if (baseQuery) {
      setRequiredFilterQuery(Lib.filter(baseQuery, STAGE_INDEX, newFilter));
    }
  };

  return (
    <Popover
      opened={isOpen}
      position="bottom-start"
      disabled={disabled || filterQuery == null}
      onChange={setIsOpen}
    >
      <Popover.Target>
        <Input
          component="button"
          type="button"
          aria-label={t`Required filter`}
          classNames={BUTTON_INPUT_CLASS_NAMES}
          disabled={disabled}
          rightSection={
            requiredFilter.filterName != null &&
            !disabled && (
              <ActionIcon
                variant="subtle"
                aria-label={t`Remove required filter`}
                onClick={(event) => {
                  event.stopPropagation();
                  setRequiredFilterQuery(null);
                }}
              >
                <Icon name="close" />
              </ActionIcon>
            )
          }
          rightSectionPointerEvents="all"
          onClick={() => setIsOpen((isOpen) => !isOpen)}
          data-testid="table-required-filter-select"
        >
          {requiredFilter.filterName ?? (
            <Input.Placeholder>{t`Add a required filter`}</Input.Placeholder>
          )}
        </Input>
      </Popover.Target>
      <Popover.Dropdown p={0}>
        {filterQuery && (
          <FilterPicker
            query={filterQuery}
            stageIndex={STAGE_INDEX}
            filter={filter}
            filterIndex={filter ? 0 : undefined}
            onSelect={handleSelect}
            onClose={() => setIsOpen(false)}
          />
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
