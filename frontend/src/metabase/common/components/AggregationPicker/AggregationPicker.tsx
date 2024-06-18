import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import AccordionList from "metabase/core/components/AccordionList";
import { useToggle } from "metabase/hooks/use-toggle";
import { useSelector } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import {
  CompareAggregations,
  getOffsetPeriod,
} from "metabase/query_builder/components/CompareAggregations";
import { ExpressionWidget } from "metabase/query_builder/components/expressions/ExpressionWidget";
import { ExpressionWidgetHeader } from "metabase/query_builder/components/expressions/ExpressionWidgetHeader";
import { getQuestion } from "metabase/query_builder/selectors";
import { trackColumnCompareViaShortcut } from "metabase/querying/analytics";
import { getMetadata } from "metabase/selectors/metadata";
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
  onAdd: (aggregations: Lib.Aggregable[]) => void;
  onSelect: (aggregation: Lib.Aggregable) => void;
  onClose?: () => void;
}

type OperatorListItem = Lib.AggregationOperatorDisplayInfo & {
  type: "operator";
  operator: Lib.AggregationOperator;
};

type MetricListItem = Lib.MetricDisplayInfo & {
  type: "metric";
  metric: Lib.MetricMetadata;
  selected: boolean;
};

type CompareListItem = {
  type: "compare";
  displayName: string;
  selected?: boolean;
};

type ListItem = OperatorListItem | MetricListItem | CompareListItem;

type Section = {
  name?: string;
  key: string;
  items: ListItem[];
  icon?: string;
  type?: string;
};

export function AggregationPicker({
  className,
  query,
  stageIndex,
  clause,
  clauseIndex,
  operators,
  hasExpressionInput = true,
  onAdd,
  onSelect,
  onClose,
}: AggregationPickerProps) {
  const question = checkNotNull(useSelector(getQuestion));
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
  const [isComparing, setIsComparing] = useState(false);

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

  const aggregations = useMemo(() => {
    return Lib.aggregations(query, stageIndex);
  }, [query, stageIndex]);

  const sections = useMemo(() => {
    const sections: Section[] = [];

    const metrics = Lib.availableMetrics(query, stageIndex);
    const databaseId = Lib.databaseID(query);
    const database = metadata.database(databaseId);
    const canUseExpressions = database?.hasFeature("expression-aggregations");
    const isMetricBased = Lib.isMetricBased(query, stageIndex);
    const compareItem = getCompareListItem(query, stageIndex, aggregations);

    if ((compareItem || operators.length > 0) && !isMetricBased) {
      const operatorItems = operators.map(operator =>
        getOperatorListItem(query, stageIndex, operator),
      );

      sections.push({
        key: "operators",
        name: t`Basic Metrics`,
        items: compareItem ? [compareItem, ...operatorItems] : operatorItems,
        icon: "table2",
      });
    }

    if (metrics.length > 0) {
      sections.push({
        key: "metrics",
        name: isMetricBased ? t`Metrics` : t`Common Metrics`,
        items: metrics.map(metric =>
          getMetricListItem(query, stageIndex, metric, clauseIndex),
        ),
        icon: "metric",
      });
    }

    if (hasExpressionInput && canUseExpressions) {
      sections.push({
        key: "custom-expression",
        name: t`Custom Expression`,
        items: [],
        icon: "sum",
        type: "action",
      });
    }

    return sections;
  }, [
    metadata,
    query,
    stageIndex,
    clauseIndex,
    operators,
    hasExpressionInput,
    aggregations,
  ]);

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

  const handleCompareSelect = useCallback(() => {
    setIsComparing(true);
  }, []);

  const handleCompareClose = useCallback(() => {
    setIsComparing(false);
  }, []);

  const handleChange = useCallback(
    (item: ListItem) => {
      if (item.type === "operator") {
        handleOperatorSelect(item);
      } else if (item.type === "metric") {
        handleMetricSelect(item);
      } else if (item.type === "compare") {
        handleCompareSelect();
      }
    },
    [handleOperatorSelect, handleMetricSelect, handleCompareSelect],
  );

  const handleSectionChange = useCallback(
    (section: Section) => {
      if (section.key === "custom-expression") {
        openExpressionEditor();
      }
    },
    [openExpressionEditor],
  );

  const handleClauseChange = useCallback(
    (name: string, clause: Lib.AggregationClause | Lib.ExpressionClause) => {
      const updatedClause = Lib.withExpressionName(clause, name);
      onSelect(updatedClause);
      onClose?.();
    },
    [onSelect, onClose],
  );

  const handleCompareSubmit = useCallback(
    (aggregations: Lib.ExpressionClause[]) => {
      onAdd(aggregations);

      trackColumnCompareViaShortcut(
        query,
        stageIndex,
        aggregations,
        question.id(),
      );

      onClose?.();
    },
    [query, stageIndex, question, onAdd, onClose],
  );

  if (isComparing) {
    return (
      <CompareAggregations
        aggregations={aggregations}
        query={query}
        stageIndex={stageIndex}
        onClose={handleCompareClose}
        onSubmit={handleCompareSubmit}
      />
    );
  }

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
    <Box className={className} c="summarize">
      <AccordionList
        sections={sections}
        onChange={handleChange}
        onChangeSection={handleSectionChange}
        itemIsSelected={checkIsItemSelected}
        renderItemName={renderItemName}
        renderItemDescription={omitItemDescription}
        // disable scrollbars inside the list
        style={{ overflow: "visible" }}
        maxHeight={Infinity}
        withBorders
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

function renderItemName(item: ListItem) {
  return item.displayName;
}

function omitItemDescription() {
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
    ...operatorInfo,
    type: "operator",
    operator,
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
    ...metricInfo,
    type: "metric",
    metric,
    selected:
      clauseIndex != null && metricInfo.aggregationPosition === clauseIndex,
  };
}

function getCompareListItem(
  query: Lib.Query,
  stageIndex: number,
  aggregations: Lib.AggregationClause[],
): CompareListItem | undefined {
  if (aggregations.length === 0) {
    return undefined;
  }

  const period = getOffsetPeriod(query, stageIndex);

  if (aggregations.length > 1) {
    return {
      type: "compare",
      displayName: t`Compare to previous ${period} ...`,
    };
  }

  const [aggregation] = aggregations;
  const info = Lib.displayInfo(query, stageIndex, aggregation);

  return {
    type: "compare",
    displayName: t`Compare “${info.displayName}” to previous ${period} ...`,
  };
}

function checkIsColumnSelected(columnInfo: Lib.ColumnDisplayInfo) {
  return !!columnInfo.selected;
}
