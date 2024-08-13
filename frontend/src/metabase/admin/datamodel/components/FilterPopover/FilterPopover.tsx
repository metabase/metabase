import cx from "classnames";
import type * as React from "react";
import { useState, useEffect } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";

import ListS from "metabase/css/components/list.module.css";
import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";
import SidebarHeader from "metabase/query_builder/components/SidebarHeader";
import { ExpressionWidget } from "metabase/query_builder/components/expressions/ExpressionWidget";
import { ExpressionWidgetHeader } from "metabase/query_builder/components/expressions/ExpressionWidgetHeader";
import { Icon } from "metabase/ui";
import type { FieldDimension } from "metabase-lib/v1/Dimension";
import { isExpression } from "metabase-lib/v1/expressions";
import type StructuredQuery from "metabase-lib/v1/queries/StructuredQuery";
import Filter from "metabase-lib/v1/queries/structured/Filter";
import { isStartingFrom } from "metabase-lib/v1/queries/utils/query-time";
import type { Expression } from "metabase-types/api";

import { DimensionList } from "../DimensionList";
import DatePicker from "../filters/pickers/DatePicker/DatePicker";
import type { DateShortcutOptions } from "../filters/pickers/DatePicker/DatePickerShortcutOptions";
import TimePicker from "../filters/pickers/TimePicker";

import {
  Button,
  EmptyFilterPickerPlaceholder,
  FilterPopoverSeparator,
} from "./FilterPopover.styled";
import { FilterPopoverFooter } from "./FilterPopoverFooter";
import { FilterPopoverHeader } from "./FilterPopoverHeader";
import { FilterPopoverPicker } from "./FilterPopoverPicker";

const MIN_WIDTH = 300;
const MAX_WIDTH = 410;

const CUSTOM_SECTION_NAME = t`Custom Expression`;

type Props = {
  className?: string;
  style?: React.CSSProperties;
  fieldPickerTitle?: string;
  filter?: Filter;
  query: StructuredQuery;
  onChange?: (filter: Filter) => void;
  onChangeFilter: (filter: Filter) => void;
  onResize?: () => void;
  onClose?: () => void;

  noCommitButton?: boolean;
  showFieldPicker?: boolean;
  showOperatorSelector?: boolean;
  dateShortcutOptions?: DateShortcutOptions;
  showCustom?: boolean;
  isNew?: boolean;
  checkedColor?: string;
};

/**
 * @deprecated use MLv2
 */
export function FilterPopover({
  isNew: isNewProp,
  filter: filterProp,
  style = {},
  showFieldPicker = true,
  showCustom = true,
  noCommitButton,
  className,
  query: legacyQuery,
  showOperatorSelector,
  fieldPickerTitle,
  dateShortcutOptions,
  checkedColor,
  onChange,
  onChangeFilter,
  onResize,
  onClose,
}: Props) {
  const [filter, setFilter] = useState(
    filterProp instanceof Filter ? filterProp : null,
  );
  const [choosingField, setChoosingField] = useState(!filter);
  const [editingFilter, setEditingFilter] = useState(
    !!(filter?.isCustom() && !isStartingFrom(filter)),
  );

  const previousQuery = usePrevious(legacyQuery);
  const question = legacyQuery.question();

  // if the underlying query changes (e.x. additional metadata is loaded) update the filter's query
  useEffect(() => {
    if (
      filter &&
      filter.legacyQuery({ useStructuredQuery: true }) === previousQuery &&
      legacyQuery !== previousQuery
    ) {
      setFilter(filter.setQuery(legacyQuery));
    }
  }, [legacyQuery, previousQuery, filter]);

  useEffect(() => {
    if (typeof onChange === "function" && filter && filter !== filterProp) {
      onChange(filter);
    }
  }, [filter, onChange, filterProp]);

  // we should only commit the filter once to prevent
  // inconsistent filters from being committed
  const handleCommitFilter = (
    newFilter: Filter | null,
    query: StructuredQuery,
  ) => {
    if (newFilter && !(newFilter instanceof Filter)) {
      newFilter = new Filter(newFilter, null, query);
    }
    if (newFilter && newFilter.isValid() && onChangeFilter) {
      onChangeFilter(newFilter);
      if (typeof onClose === "function") {
        onClose();
      }
    }
  };

  const handleUpdateAndCommit = (newFilterMbql: any[]) => {
    const base = filter || new Filter([], null, legacyQuery);
    const newFilter = base.set(newFilterMbql) as Filter;

    setFilter(newFilter);
    handleCommitFilter(newFilter, legacyQuery);
  };

  const handleCommit = (newFilterMbql?: any[]) => {
    handleCommitFilter(
      newFilterMbql ? filter?.set(newFilterMbql) : filter,
      legacyQuery,
    );
  };

  const handleDimensionChange = (dimension: FieldDimension) => {
    const field = dimension?.field();
    const newFilter =
      !filter ||
      filter.legacyQuery({ useStructuredQuery: true }) !==
        dimension.legacyQuery({ useStructuredQuery: true }) ||
      field?.isDate?.()
        ? new Filter(
            [],
            null,
            dimension.legacyQuery({ useStructuredQuery: true }) ||
              (filter && filter.legacyQuery({ useStructuredQuery: true })) ||
              legacyQuery,
          )
        : filter;

    setFilter(
      newFilter.setDimension(dimension.mbql(), { useDefaultOperator: true }),
    );

    setChoosingField(false);
  };

  const handleFilterChange = (mbql: any[] = []) => {
    const newFilter = filter
      ? filter.set(mbql)
      : new Filter(mbql, null, legacyQuery);
    setFilter(newFilter);
    onResize?.();
  };

  const handleExpressionChange = (name: string, expression: Expression) => {
    if (isExpression(expression) && Array.isArray(expression)) {
      handleUpdateAndCommit(expression);
    }
  };

  const handleExpressionWidgetClose = () => {
    setEditingFilter(false);
  };

  if (editingFilter) {
    const filterMBQL = filter?.raw();
    const expression = isExpression(filterMBQL) ? filterMBQL : undefined;
    return (
      <ExpressionWidget
        query={question.query()}
        stageIndex={-1}
        expression={expression}
        startRule="boolean"
        header={<ExpressionWidgetHeader onBack={handleExpressionWidgetClose} />}
        onChangeExpression={handleExpressionChange}
        onClose={handleExpressionWidgetClose}
      />
    );
  }

  const dimension = filter && filter.dimension();
  if (!filter || choosingField || !dimension) {
    return (
      <div
        className={className}
        style={{ minWidth: MIN_WIDTH, overflowY: "auto", ...style }}
      >
        {fieldPickerTitle && (
          <SidebarHeader
            className={cx(CS.mx1, CS.my2)}
            title={fieldPickerTitle}
          />
        )}
        <DimensionList
          style={{ color: color("filter") }}
          maxHeight={Infinity}
          dimension={dimension}
          sections={(
            (filter && filter.legacyQuery({ useStructuredQuery: true })) ||
            legacyQuery
          ).filterFieldOptionSections(filter, {
            includeSegments: showCustom,
          })}
          onChangeDimension={(dimension: FieldDimension) =>
            handleDimensionChange(dimension)
          }
          onChangeOther={(item: { filter: Filter; query: StructuredQuery }) => {
            // special case for segments
            handleCommitFilter(item.filter, item.query);
          }}
          width="100%"
          alwaysExpanded={false}
        />
        {showCustom && (
          <div
            style={{ color: color("filter") }}
            data-element-id="list-section"
            className={cx(ListS.ListSectionToggleAble)}
            onClick={() => setEditingFilter(true)}
          >
            <div
              className={cx(
                ListS.ListSectionHeader,
                CS.mx2,
                CS.py2,
                CS.flex,
                CS.alignCenter,
                CS.hoverParent,
                CS.cursorPointer,
              )}
            >
              <span
                className={cx(
                  ListS.ListSectionIcon,
                  CS.mr1,
                  CS.flex,
                  CS.alignCenter,
                )}
              >
                <Icon name="filter" />
              </span>
              <h3 className={cx(ListS.ListSectionTitle, CS.textWrap)}>
                {CUSTOM_SECTION_NAME}
              </h3>
            </div>
          </div>
        )}
      </div>
    );
  }

  const field = dimension.field();
  const isNew = isNewProp || !filterProp?.operator();
  const primaryColor = color("brand");
  const onBack = () => {
    setChoosingField(true);
  };

  const shouldShowDatePicker = field?.isDate() && !field?.isTime();
  const supportsExpressions = question.database()?.supportsExpressions();

  const filterOperator = filter.operator();
  const hasPicker = filterOperator && filterOperator.fields.length > 0;

  return (
    <div className={className} style={{ minWidth: MIN_WIDTH, ...style }}>
      {shouldShowDatePicker ? (
        <DatePicker
          className={className}
          filter={filter}
          dateShortcutOptions={dateShortcutOptions}
          minWidth={MIN_WIDTH}
          maxWidth={MAX_WIDTH}
          onBack={onBack}
          onCommit={handleCommit}
          onFilterChange={handleFilterChange}
          disableChangingDimension={!showFieldPicker}
          supportsExpressions={supportsExpressions}
        >
          <Button
            data-ui-tag="add-filter"
            primaryColor={primaryColor}
            disabled={!filter.isValid()}
            className={CS.mlAuto}
            onClick={() => handleCommit()}
          >
            {isNew ? t`Add filter` : t`Update filter`}
          </Button>
        </DatePicker>
      ) : (
        <div>
          {field?.isTime() ? (
            <TimePicker
              className={className}
              filter={filter}
              primaryColor={primaryColor}
              minWidth={MIN_WIDTH}
              maxWidth={MAX_WIDTH}
              onBack={onBack}
              onCommit={handleCommit}
              onFilterChange={handleFilterChange}
            />
          ) : (
            <>
              <FilterPopoverHeader
                filter={filter}
                onFilterChange={handleFilterChange}
                onBack={onBack}
                showFieldPicker={showFieldPicker}
                forceShowOperatorSelector={showOperatorSelector}
              />
              {hasPicker ? (
                <>
                  <FilterPopoverSeparator data-testid="filter-popover-separator" />
                  <FilterPopoverPicker
                    className={cx(CS.px1, CS.pt1, CS.pb1)}
                    filter={filter}
                    onFilterChange={handleFilterChange}
                    onCommit={handleCommit}
                    maxWidth={MAX_WIDTH}
                    primaryColor={primaryColor}
                    checkedColor={checkedColor}
                  />
                </>
              ) : (
                <EmptyFilterPickerPlaceholder data-testid="empty-picker-placeholder" />
              )}
            </>
          )}
          <FilterPopoverFooter
            className={cx(CS.px1, CS.pb1)}
            filter={filter}
            onFilterChange={handleFilterChange}
            onCommit={!noCommitButton ? handleCommit : null}
            isNew={!!isNew}
          />
        </div>
      )}
    </div>
  );
}
