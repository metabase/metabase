import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { Box } from "metabase/ui";
import { getColumnIcon } from "metabase/common/utils/columns";
import {
  getColumnGroupIcon,
  getColumnGroupName,
} from "metabase/common/utils/column-groups";
import { useToggle } from "metabase/hooks/use-toggle";

import { Icon } from "metabase/core/components/Icon";
import type { IconName } from "metabase/core/components/Icon";
import { ExpressionWidget } from "metabase/query_builder/components/expressions/ExpressionWidget";
import { ExpressionWidgetHeader } from "metabase/query_builder/components/expressions/ExpressionWidgetHeader";

import type { Expression as LegacyExpressionClause } from "metabase-types/api";
import * as Lib from "metabase-lib";

import { isExpression as isLegacyExpression } from "metabase-lib/expressions";
import LegacyFilter from "metabase-lib/queries/structured/Filter";
import type LegacyQuery from "metabase-lib/queries/StructuredQuery";

import { BooleanFilterPicker } from "./BooleanFilterPicker";
import { DateFilterPicker } from "./DateFilterPicker";
import { NumberFilterPicker } from "./NumberFilterPicker";
import { CoordinateFilterPicker } from "./CoordinateFilterPicker";
import { StringFilterPicker } from "./StringFilterPicker";
import { TimeFilterPicker } from "./TimeFilterPicker";
import { StyledAccordionList } from "./FilterPicker.styled";

export interface FilterPickerProps {
  query: Lib.Query;
  stageIndex: number;
  filter?: Lib.FilterClause;

  legacyQuery: LegacyQuery;
  legacyFilter?: LegacyFilter;
  onSelectLegacy: (legacyFilter: LegacyFilter) => void;

  onSelect: (filter: Lib.ExpressionClause) => void;
  onClose?: () => void;
}

type Section = {
  key?: string;
  name: string;
  items: Lib.ColumnMetadata[];
  icon?: IconName;
};

const MIN_WIDTH = 300;
const MAX_WIDTH = 410;

const CUSTOM_EXPRESSION_SECTION: Section = {
  key: "custom-expression",
  name: t`Custom Expression`,
  items: [],
  icon: "filter",
};

export function FilterPicker({
  query,
  stageIndex,
  filter,
  legacyQuery,
  legacyFilter,
  onSelect,
  onSelectLegacy,
  onClose,
}: FilterPickerProps) {
  const [
    isEditingExpression,
    { turnOn: openExpressionEditor, turnOff: closeExpressionEditor },
  ] = useToggle(filter && Lib.isCustomFilter(query, stageIndex, filter));

  const [column, setColumn] = useState<Lib.ColumnMetadata | undefined>(
    getInitialColumn(query, stageIndex, filter),
  );

  const renderItemName = useCallback(
    (column: Lib.ColumnMetadata) =>
      Lib.displayInfo(query, stageIndex, column).displayName,
    [query, stageIndex],
  );

  const sections = useMemo(() => {
    const columns = Lib.filterableColumns(query, stageIndex);
    const columnGroups = Lib.groupColumns(columns);

    const sections = columnGroups.map(group => {
      const groupInfo = Lib.displayInfo(query, stageIndex, group);
      return {
        name: getColumnGroupName(groupInfo),
        icon: getColumnGroupIcon(groupInfo),
        items: Lib.getColumnsFromColumnGroup(group),
      };
    });

    return [...sections, CUSTOM_EXPRESSION_SECTION];
  }, [query, stageIndex]);

  const checkColumnSelected = () => false;

  const handleChange = (filter: Lib.ExpressionClause) => {
    onSelect(filter);
    onClose?.();
  };

  const handleSectionChange = useCallback(
    (section: Section) => {
      if (section.key === "custom-expression") {
        openExpressionEditor();
      }
    },
    [openExpressionEditor],
  );

  const handleExpressionChange = useCallback(
    (name: string, expression: LegacyExpressionClause) => {
      if (Array.isArray(expression) && isLegacyExpression(expression)) {
        const baseFilter =
          legacyFilter || new LegacyFilter([], null, legacyQuery);
        const nextFilter = baseFilter.set(expression);
        onSelectLegacy(nextFilter);
        onClose?.();
      }
    },
    [legacyQuery, legacyFilter, onSelectLegacy, onClose],
  );

  if (isEditingExpression) {
    return (
      <ExpressionWidget
        query={legacyQuery}
        expression={legacyFilter?.raw() as LegacyExpressionClause}
        startRule="boolean"
        header={<ExpressionWidgetHeader onBack={closeExpressionEditor} />}
        onChangeExpression={handleExpressionChange}
        onClose={closeExpressionEditor}
      />
    );
  }

  const renderContent = () => {
    if (!column) {
      return (
        <StyledAccordionList
          sections={sections}
          onChange={setColumn}
          onChangeSection={handleSectionChange}
          itemIsSelected={checkColumnSelected}
          renderItemName={renderItemName}
          renderItemDescription={omitItemDescription}
          renderItemIcon={renderItemIcon}
          // Compat with E2E tests around MLv1-based components
          // Prefer using a11y role selectors
          itemTestId="dimension-list-item"
        />
      );
    }

    const FilterWidget = getFilterWidget(column);
    return (
      <FilterWidget
        query={query}
        stageIndex={stageIndex}
        column={column}
        filter={filter}
        onChange={handleChange}
        onBack={() => setColumn(undefined)}
      />
    );
  };

  return (
    <Box miw={MIN_WIDTH} maw={MAX_WIDTH}>
      {renderContent()}
    </Box>
  );
}

function getInitialColumn(
  query: Lib.Query,
  stageIndex: number,
  filter?: Lib.FilterClause,
) {
  return filter
    ? Lib.filterParts(query, stageIndex, filter)?.column
    : undefined;
}

function omitItemDescription() {
  return null;
}

function renderItemIcon(column: Lib.ColumnMetadata) {
  return <Icon name={getColumnIcon(column)} size={18} />;
}

const NotImplementedPicker = () => <div />;

function getFilterWidget(column: Lib.ColumnMetadata) {
  if (Lib.isBoolean(column)) {
    return BooleanFilterPicker;
  }
  if (Lib.isTime(column)) {
    return TimeFilterPicker;
  }
  if (Lib.isDate(column)) {
    return DateFilterPicker;
  }
  if (Lib.isCoordinate(column)) {
    return CoordinateFilterPicker;
  }
  if (Lib.isString(column)) {
    return StringFilterPicker;
  }
  if (Lib.isNumeric(column)) {
    return NumberFilterPicker;
  }
  return NotImplementedPicker;
}
