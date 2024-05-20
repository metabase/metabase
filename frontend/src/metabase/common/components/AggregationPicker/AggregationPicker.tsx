import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import AccordionList from "metabase/core/components/AccordionList";
import { useToggle } from "metabase/hooks/use-toggle";
import { color } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import { ExpressionWidget } from "metabase/query_builder/components/expressions/ExpressionWidget";
import { ExpressionWidgetHeader } from "metabase/query_builder/components/expressions/ExpressionWidgetHeader";
import { getMetadata } from "metabase/selectors/metadata";
import type { IconName } from "metabase/ui";
import { Box, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";

import { QueryColumnPicker } from "../QueryColumnPicker";

import {
  ColumnPickerContainer,
  ColumnPickerHeaderContainer,
  ColumnPickerHeaderTitle,
  ColumnPickerHeaderTitleContainer,
} from "./AggregationPicker.styled";

interface AggregationPickerProps {
  className?: string;
  query: Lib.Query;
  stageIndex: number;
  clause?: Lib.AggregationClause;
  clauseIndex?: number;
  operators: Lib.AggregationOperator[];
  hasExpressionInput?: boolean;
  onSelect: (operator: Lib.Aggregable) => void;
  onClose?: () => void;
}

type OperatorListItem = {
  operator: Lib.AggregationOperator;
  name: string;
  icon?: IconName;
  selected?: boolean;
  requiresColumn?: boolean;
};

type MetricListItem = {
  metric: Lib.MetricMetadata;
  name: string;
  icon?: IconName;
  selected?: boolean;
};

type ExpressionListItem = {
  name: string;
  icon?: IconName;
  selected?: boolean;
};

type ListItem = OperatorListItem | MetricListItem | ExpressionListItem;

function isOperatorListItem(item: ListItem): item is OperatorListItem {
  return "operator" in item;
}

function isMetricListItem(item: ListItem): item is MetricListItem {
  return "metric" in item;
}

export function AggregationPicker({
  className,
  query,
  stageIndex,
  clause,
  clauseIndex,
  operators,
  hasExpressionInput = true,
  onSelect,
  onClose,
}: AggregationPickerProps) {
  const metadata = useSelector(getMetadata);
  const displayInfo = clause
    ? Lib.displayInfo(query, stageIndex, clause)
    : undefined;
  const initialOperator = getInitialOperator(query, stageIndex, operators);
  const [
    isEditingExpression,
    { turnOn: openExpressionEditor, turnOff: closeExpressionEditor },
  ] = useToggle(
    isExpressionEditorInitiallyOpen(query, stageIndex, clause, operators),
  );

  // For really simple inline expressions like Average([Price]),
  // MLv2 can figure out that "Average" operator is used.
  // We don't want that though, so we don't break navigation inside the picker
  const [operator, setOperator] = useState<Lib.AggregationOperator | null>(
    isEditingExpression ? null : initialOperator,
  );

  const operatorInfo = useMemo(
    () => (operator ? Lib.displayInfo(query, stageIndex, operator) : null),
    [query, stageIndex, operator],
  );

  const { items, hasOperators } = useMemo(() => {
    const items: ListItem[] = [];
    const metrics = Lib.availableMetrics(query, stageIndex);
    const databaseId = Lib.databaseID(query);
    const database = metadata.database(databaseId);
    const canUseExpressions = database?.hasFeature("expression-aggregations");
    const isMetricBased = Lib.isMetricBased(query, stageIndex);
    const hasOperators = operators.length > 0 && !isMetricBased;
    const hasMetrics = metrics.length > 0;
    const hasExpressions = hasExpressionInput && canUseExpressions;

    if (hasOperators) {
      items.push(
        ...operators.map(operator =>
          getOperatorListItem(query, stageIndex, operator),
        ),
      );
    }

    if (hasMetrics) {
      items.push(
        ...metrics.map(metric =>
          getMetricListItem(query, stageIndex, metric, clauseIndex),
        ),
      );
    }
    if (hasExpressions) {
      items.push({
        name: t`Custom expression …`,
        icon: "sum",
      });
    }

    return { items, hasOperators };
  }, [metadata, query, stageIndex, clauseIndex, operators, hasExpressionInput]);

  const checkIsItemSelected = useCallback(
    (item: ListItem) => item.selected,
    [],
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
    (item: MetricListItem) => {
      onSelect(item.metric);
      onClose?.();
    },
    [onSelect, onClose],
  );

  const handleChange = useCallback(
    (item: ListItem) => {
      if (isOperatorListItem(item)) {
        handleOperatorSelect(item);
      } else if (isMetricListItem(item)) {
        handleMetricSelect(item);
      } else {
        openExpressionEditor();
      }
    },
    [handleOperatorSelect, handleMetricSelect, openExpressionEditor],
  );

  const handleClauseChange = useCallback(
    (name: string, clause: Lib.AggregationClause | Lib.ExpressionClause) => {
      const updatedClause = Lib.withExpressionName(clause, name);
      onSelect(updatedClause);
      onClose?.();
    },
    [onSelect, onClose],
  );

  if (isEditingExpression) {
    return (
      <ExpressionWidget
        query={query}
        stageIndex={stageIndex}
        name={displayInfo?.displayName}
        clause={clause}
        withName
        startRule="aggregation"
        header={<ExpressionWidgetHeader onBack={closeExpressionEditor} />}
        onChangeClause={handleClauseChange}
        onClose={closeExpressionEditor}
      />
    );
  }

  if (operator && operatorInfo?.requiresColumn) {
    const columns = Lib.aggregationOperatorColumns(operator);
    const columnGroups = Lib.groupColumns(columns);
    return (
      <ColumnPickerContainer
        className={className}
        data-testid="aggregation-column-picker"
      >
        <ColumnPickerHeader onClick={handleResetOperator}>
          {operatorInfo.displayName}
        </ColumnPickerHeader>
        <QueryColumnPicker
          query={query}
          stageIndex={stageIndex}
          columnGroups={columnGroups}
          hasTemporalBucketing
          color="summarize"
          checkIsColumnSelected={checkIsColumnSelected}
          onSelect={handleColumnSelect}
          onClose={onClose}
        />
      </ColumnPickerContainer>
    );
  }

  return (
    <Box className={className} c="summarize" py={"sm"}>
      <AccordionList
        sections={[{ items }]}
        onChange={handleChange}
        itemIsSelected={checkIsItemSelected}
        renderItemIcon={(item: ListItem) => renderItemIcon(item, hasOperators)}
        // disable scrollbars inside the list
        style={{ overflow: "visible" }}
        maxHeight={Infinity}
      />
    </Box>
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
      <ColumnPickerHeaderTitleContainer onClick={onClick} aria-label={t`Back`}>
        <Icon name="chevronleft" size={18} />
        <ColumnPickerHeaderTitle>{children}</ColumnPickerHeaderTitle>
      </ColumnPickerHeaderTitleContainer>
    </ColumnPickerHeaderContainer>
  );
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

function isExpressionEditorInitiallyOpen(
  query: Lib.Query,
  stageIndex: number,
  clause: Lib.AggregationClause | undefined,
  operators: Lib.AggregationOperator[],
): boolean {
  if (!clause) {
    return (
      Lib.isMetricBased(query, stageIndex) &&
      Lib.availableMetrics(query, stageIndex)
        .map(metric => Lib.displayInfo(query, stageIndex, metric))
        .every(metricInfo => metricInfo.aggregationPosition != null)
    );
  }

  const initialOperator = getInitialOperator(query, stageIndex, operators);
  const isCustomExpression = initialOperator === null;
  const displayInfo = Lib.displayInfo(query, stageIndex, clause);
  const hasCustomName = Boolean(displayInfo?.isNamed);

  return isCustomExpression || hasCustomName;
}

function getOperatorListItem(
  query: Lib.Query,
  stageIndex: number,
  operator: Lib.AggregationOperator,
): OperatorListItem {
  const operatorInfo = Lib.displayInfo(query, stageIndex, operator);
  return {
    operator,
    name: operatorInfo.displayName,
    requiresColumn: operatorInfo.requiresColumn,
    selected: operatorInfo.selected,
  };
}

function getMetricListItem(
  query: Lib.Query,
  stageIndex: number,
  metric: Lib.MetricMetadata,
  clauseIndex?: number,
): MetricListItem {
  const metricInfo = Lib.displayInfo(query, stageIndex, metric);
  return {
    metric,
    name: metricInfo.displayName,
    icon: "metric",
    selected:
      clauseIndex != null && metricInfo.aggregationPosition === clauseIndex,
  };
}

function checkIsColumnSelected(columnInfo: Lib.ColumnDisplayInfo) {
  return !!columnInfo.selected;
}

function renderItemIcon(item: ListItem, hasOperators: boolean) {
  if (!item.icon) {
    return undefined;
  }

  return (
    <Box component="span" ml={hasOperators ? "sm" : undefined}>
      <Icon name={item.icon} style={{ color: color("summarize") }} />
    </Box>
  );
}
