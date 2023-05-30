import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import AccordionList from "metabase/core/components/AccordionList";
import { Icon } from "metabase/core/components/Icon";

import type { Aggregation as LegacyAggregationClause } from "metabase-types/api";
import * as Lib from "metabase-lib";
import * as AGGREGATION from "metabase-lib/queries/utils/aggregation";
import type LegacyAggregation from "metabase-lib/queries/structured/Aggregation";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import Metric from "metabase-lib/metadata/Metric";

import QueryColumnPicker from "../QueryColumnPicker";
import {
  ColumnPickerContainer,
  ColumnPickerHeaderContainer,
  ColumnPickerHeaderTitleContainer,
  ColumnPickerHeaderTitle,
  InfoIconContainer,
} from "./AggregationPicker.styled";

const DEFAULT_MAX_HEIGHT = 610;

interface AggregationPickerProps {
  className?: string;
  query: Lib.Query;
  stageIndex: number;
  operators: Lib.AggregationOperator[];
  legacyQuery: StructuredQuery;
  legacyClause?: LegacyAggregation;
  maxHeight?: number;
  onSelect: (operator: Lib.AggregationClause) => void;
  onSelectLegacy: (operator: LegacyAggregationClause) => void;
  onClose?: () => void;
}

type OperatorListItem = Lib.AggregationOperatorDisplayInfo & {
  operator: Lib.AggregationOperator;
};

type ListItem = OperatorListItem | Metric;

type Section = {
  name: string;
  items: ListItem[];
  icon?: string;
};

function isOperatorListItem(item: ListItem): item is OperatorListItem {
  return !(item instanceof Metric);
}

export function AggregationPicker({
  className,
  query,
  stageIndex,
  operators,
  legacyQuery,
  legacyClause,
  maxHeight = DEFAULT_MAX_HEIGHT,
  onSelect,
  onSelectLegacy,
  onClose,
}: AggregationPickerProps) {
  const [operator, setOperator] = useState<Lib.AggregationOperator | null>(
    getInitialOperator(query, stageIndex, operators),
  );

  const operatorInfo = useMemo(
    () => (operator ? Lib.displayInfo(query, stageIndex, operator) : null),
    [query, stageIndex, operator],
  );

  const sections = useMemo(() => {
    const sections: Section[] = [];

    const unfilteredMetrics = legacyQuery.table()?.getMetrics() ?? [];
    const metrics = unfilteredMetrics.filter(metric => !metric.archived);

    if (operators.length > 0) {
      sections.push({
        name: t`Basic Metrics`,
        items: operators.map(operator =>
          getOperatorListItem(query, stageIndex, operator),
        ),
        icon: "table2",
      });
    }

    if (metrics.length > 0) {
      sections.push({
        name: t`Common Metrics`,
        items: metrics,
        icon: "star_outline",
      });
    }

    return sections;
  }, [query, legacyQuery, stageIndex, operators]);

  const checkIsItemSelected = useCallback(
    (item: ListItem) => {
      if (isOperatorListItem(item)) {
        return item.selected;
      }
      if (legacyClause) {
        return AGGREGATION.getMetric(legacyClause) === item.id;
      }
      return false;
    },
    [legacyClause],
  );

  const handleOperatorSelect = useCallback(
    (item: OperatorListItem) => {
      if (item.requiresColumn) {
        setOperator(item.operator);
      } else {
        const clause = Lib.aggregationClause(item.operator);
        onSelect(clause);
        onClose?.();
      }
    },
    [onSelect, onClose],
  );

  const handleResetOperator = useCallback(() => {
    setOperator(null);
  }, []);

  const handleColumnSelect = useCallback(
    (column: Lib.ColumnMetadata) => {
      if (!operator) {
        return;
      }
      const clause = Lib.aggregationClause(operator, column);
      onSelect(clause);
      onClose?.();
    },
    [operator, onSelect, onClose],
  );

  const handleMetricSelect = useCallback(
    (metric: Metric) => {
      onSelectLegacy(metric.aggregationClause());
      onClose?.();
    },
    [onSelectLegacy, onClose],
  );

  const handleChange = useCallback(
    (item: ListItem) => {
      if (isOperatorListItem(item)) {
        handleOperatorSelect(item);
      } else {
        handleMetricSelect(item);
      }
    },
    [handleOperatorSelect, handleMetricSelect],
  );

  if (operator && operatorInfo?.requiresColumn) {
    const columns = Lib.aggregationOperatorColumns(operator);
    const columnGroups = Lib.groupColumns(columns);
    return (
      <ColumnPickerContainer className={className}>
        <ColumnPickerHeader onClick={handleResetOperator}>
          {operatorInfo.displayName}
        </ColumnPickerHeader>
        <QueryColumnPicker
          query={query}
          stageIndex={stageIndex}
          columnGroups={columnGroups}
          hasTemporalBucketing
          maxHeight={maxHeight}
          checkIsColumnSelected={checkColumnSelected}
          onSelect={handleColumnSelect}
          onClose={onClose}
        />
      </ColumnPickerContainer>
    );
  }

  return (
    <AccordionList
      className={className}
      sections={sections}
      maxHeight={maxHeight}
      alwaysExpanded={false}
      onChange={handleChange}
      itemIsSelected={checkIsItemSelected}
      renderItemName={renderItemName}
      renderItemDescription={omitItemDescription}
      renderItemExtra={renderItemExtra}
    />
  );
}

function ColumnPickerHeader({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <ColumnPickerHeaderContainer>
      <ColumnPickerHeaderTitleContainer onClick={onClick}>
        <Icon name="chevronleft" size={18} />
        <ColumnPickerHeaderTitle>{children}</ColumnPickerHeaderTitle>
      </ColumnPickerHeaderTitleContainer>
    </ColumnPickerHeaderContainer>
  );
}

function renderItemName(item: ListItem) {
  return isOperatorListItem(item) ? item.displayName : item.displayName();
}

function omitItemDescription() {
  return null;
}

function renderItemExtra(item: ListItem) {
  if (item.description) {
    return (
      <InfoIconContainer>
        <Icon name="question" size={20} tooltip={item.description} />
      </InfoIconContainer>
    );
  }
  return null;
}

function getInitialOperator(
  query: Lib.Query,
  stageIndex: number,
  operators: Lib.AggregationOperator[],
) {
  const operator = operators.find(
    operator => Lib.displayInfo(query, stageIndex, operator).selected,
  );
  return operator ?? null;
}

function getOperatorListItem(
  query: Lib.Query,
  stageIndex: number,
  operator: Lib.AggregationOperator,
): OperatorListItem {
  const operatorInfo = Lib.displayInfo(query, stageIndex, operator);
  return {
    ...operatorInfo,
    operator,
  };
}

function checkColumnSelected(columnInfo: Lib.ColumnDisplayInfo) {
  return !!columnInfo.selected;
}
