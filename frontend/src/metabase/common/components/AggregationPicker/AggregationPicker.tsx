import { type ReactNode, useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import {
  HoverParent,
  PopoverDefaultIcon,
  PopoverHoverTarget,
} from "metabase/components/MetadataInfo/InfoIcon";
import { Popover } from "metabase/components/MetadataInfo/Popover";
import AccordionList from "metabase/core/components/AccordionList";
import Markdown from "metabase/core/components/Markdown";
import { useToggle } from "metabase/hooks/use-toggle";
import { useSelector } from "metabase/lib/redux";
import {
  CompareAggregations,
  canAddTemporalCompareAggregation,
} from "metabase/query_builder/components/CompareAggregations";
import { ExpressionWidget } from "metabase/query_builder/components/expressions/ExpressionWidget";
import { ExpressionWidgetHeader } from "metabase/query_builder/components/expressions/ExpressionWidgetHeader";
import { getQuestion } from "metabase/query_builder/selectors";
import { trackColumnCompareViaShortcut } from "metabase/querying/analytics";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Flex, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";

import { QueryColumnPicker } from "../QueryColumnPicker";

import {
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
  allowCustomExpressions?: boolean;
  allowTemporalComparisons?: boolean;
  onClose?: () => void;
  onQueryChange: (query: Lib.Query) => void;
}

type OperatorListItem = Lib.AggregationOperatorDisplayInfo & {
  type: "operator";
  operator: Lib.AggregationOperator;
  name: string;
};

type MetricListItem = Lib.MetricDisplayInfo & {
  type: "metric";
  metric: Lib.MetricMetadata;
  name: string;
  selected: boolean;
};

type ListItem = OperatorListItem | MetricListItem;

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
  allowCustomExpressions = false,
  allowTemporalComparisons = false,
  onClose,
  onQueryChange,
}: AggregationPickerProps) {
  const question = useSelector(getQuestion);
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

  const onSelect = useCallback(
    function (aggregation: Lib.Aggregable) {
      const isUpdate = clause != null && clauseIndex != null;
      if (isUpdate) {
        const nextQuery = Lib.replaceClause(
          query,
          stageIndex,
          clause,
          aggregation,
        );
        onQueryChange(nextQuery);
      } else {
        const nextQuery = Lib.aggregate(query, stageIndex, aggregation);
        onQueryChange(nextQuery);
      }
    },
    [query, stageIndex, clause, clauseIndex, onQueryChange],
  );

  const sections = useMemo(() => {
    const sections: Section[] = [];

    const metrics = Lib.availableMetrics(query, stageIndex);
    const databaseId = Lib.databaseID(query);
    const database = metadata.database(databaseId);
    const supportsCustomExpressions = database?.hasFeature(
      "expression-aggregations",
    );

    if (operators.length > 0) {
      const operatorItems = operators.map(operator =>
        getOperatorListItem(query, stageIndex, operator),
      );

      sections.push({
        key: "operators",
        name: t`Basic functions`,
        items: operatorItems,
        icon: "table2",
      });
    }

    if (metrics.length > 0) {
      sections.push({
        key: "metrics",
        name: t`Metrics`,
        items: metrics.map(metric =>
          getMetricListItem(query, stageIndex, metric, clauseIndex),
        ),
        icon: "metric",
      });
    }

    if (
      allowTemporalComparisons &&
      canAddTemporalCompareAggregation(query, stageIndex)
    ) {
      sections.push({
        type: "action",
        key: "compare",
        name: t`Compare to the past`,
        icon: "lines",
        items: [],
      });
    }

    if (allowCustomExpressions && supportsCustomExpressions) {
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
    allowCustomExpressions,
    allowTemporalComparisons,
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
      }
    },
    [handleOperatorSelect, handleMetricSelect],
  );

  const handleSectionChange = useCallback(
    (section: Section) => {
      if (section.key === "custom-expression") {
        openExpressionEditor();
      }
      if (section.key === "compare") {
        handleCompareSelect();
      }
    },
    [openExpressionEditor, handleCompareSelect],
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
    (query: Lib.Query, aggregations: Lib.ExpressionClause[]) => {
      onQueryChange(query);

      if (question) {
        trackColumnCompareViaShortcut(
          query,
          stageIndex,
          aggregations,
          question.id(),
        );
      }

      onClose?.();
    },
    [stageIndex, question, onClose, onQueryChange],
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
      <Box
        className={className}
        mih="18.75rem"
        data-testid="aggregation-column-picker"
        c="summarize"
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
      </Box>
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
        renderItemExtra={renderItemIcon}
        renderItemWrapper={renderItemWrapper}
        // disable scrollbars inside the list
        style={{ overflow: "visible" }}
        maxHeight={Infinity}
        withBorders
        globalSearch
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

function renderItemWrapper(content: ReactNode) {
  return <HoverParent>{content}</HoverParent>;
}

function renderItemIcon(item: ListItem) {
  if (item.type !== "metric") {
    return null;
  }

  if (!item.description) {
    return null;
  }

  return (
    <Flex pr="sm" align="center">
      <Popover
        position="right"
        content={
          <Box p="md">
            <Markdown disallowHeading unstyleLinks>
              {item.description}
            </Markdown>
          </Box>
        }
      >
        <span aria-label={t`More info`}>
          <PopoverDefaultIcon name="empty" size={18} />
          <PopoverHoverTarget name="info_filled" hasDescription size={18} />
        </span>
      </Popover>
    </Flex>
  );
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
    return false;
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
    name: operatorInfo.displayName,
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
    name: metricInfo.displayName,
    metric,
    selected:
      clauseIndex != null && metricInfo.aggregationPosition === clauseIndex,
  };
}

function checkIsColumnSelected(columnInfo: Lib.ColumnDisplayInfo) {
  return !!columnInfo.selected;
}
