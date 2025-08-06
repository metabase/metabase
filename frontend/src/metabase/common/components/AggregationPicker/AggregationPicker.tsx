import { type ReactNode, useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import {
  AccordionList,
  type Section as BaseSection,
} from "metabase/common/components/AccordionList";
import Markdown from "metabase/common/components/Markdown";
import {
  HoverParent,
  PopoverDefaultIcon,
  PopoverHoverTarget,
} from "metabase/common/components/MetadataInfo/InfoIcon";
import { Popover } from "metabase/common/components/MetadataInfo/Popover";
import { useToggle } from "metabase/common/hooks/use-toggle";
import { useSelector } from "metabase/lib/redux";
import {
  ExpressionWidget,
  ExpressionWidgetHeader,
} from "metabase/query_builder/components/expressions";
import {
  type DefinedClauseName,
  type MBQLClauseFunctionConfig,
  clausesForMode,
  getClauseDefinition,
} from "metabase/querying/expressions";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Flex, Icon, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import { QueryColumnPicker } from "../QueryColumnPicker";

import {
  ColumnPickerHeaderContainer,
  ColumnPickerHeaderTitleContainer,
} from "./AggregationPicker.styled";

export interface AggregationPickerProps {
  className?: string;
  query: Lib.Query;
  stageIndex: number;
  clause?: Lib.AggregationClause;
  clauseIndex?: number;
  operators: Lib.AggregationOperator[];
  allowCustomExpressions?: boolean;
  onClose?: () => void;
  onQueryChange: (query: Lib.Query) => void;
  onBack?: () => void;
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

type ExpressionClauseListItem = {
  type: "expression-clause";
  clause: MBQLClauseFunctionConfig;
  displayName: string;
};

type Item = OperatorListItem | MetricListItem | ExpressionClauseListItem;
type Section = BaseSection<Item>;

export function AggregationPicker({
  className,
  query,
  stageIndex,
  clause,
  clauseIndex,
  operators,
  allowCustomExpressions = false,
  onClose,
  onQueryChange,
  onBack,
}: AggregationPickerProps) {
  const metadata = useSelector(getMetadata);
  const displayInfo = clause
    ? Lib.displayInfo(query, stageIndex, clause)
    : undefined;
  const initialOperator = getInitialOperator(query, stageIndex, operators);
  const [searchText, setSearchText] = useState("");
  const isSearching = searchText !== "";
  const [
    isEditingExpression,
    { turnOn: openExpressionEditor, turnOff: closeExpressionEditor },
  ] = useToggle(
    isExpressionEditorInitiallyOpen(query, stageIndex, clause, operators),
  );
  const [initialExpressionClause, setInitialExpressionClause] =
    useState<DefinedClauseName | null>(null);

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
      const operatorItems = operators.map((operator) =>
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
        items: metrics.map((metric) =>
          getMetricListItem(query, stageIndex, metric, clauseIndex),
        ),
        icon: "metric",
      });
    }

    if (allowCustomExpressions && supportsCustomExpressions) {
      if (isSearching) {
        sections.push({
          key: "expression-clauses",
          name: t`Custom Expressions`,
          icon: "function" as const,
          items: clausesForMode("aggregation").map(getExpressionClauseListItem),
          alwaysSortLast: true,
        });
      }
      sections.push({
        key: "custom-expression",
        name: t`Custom Expression`,
        items: [],
        icon: "sum",
        type: "action",
        alwaysSortLast: true,
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
    isSearching,
  ]);

  const availableColumns = useMemo(
    () => Lib.aggregableColumns(query, stageIndex, clauseIndex),
    [query, stageIndex, clauseIndex],
  );

  const checkIsItemSelected = useCallback(
    (item: Item) => "selected" in item && item.selected,
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

  const handleExpressionSelect = useCallback(
    (clause?: DefinedClauseName) => {
      if (clause) {
        setInitialExpressionClause(clause);
      }
      openExpressionEditor();
    },
    [openExpressionEditor],
  );

  const handleResetOperator = useCallback(() => {
    setOperator(null);
    onBack?.();
  }, [onBack]);

  const handleChangeSearchText = useCallback(
    (searchText: string) => {
      setSearchText(searchText);

      if (searchText.trim().endsWith("(")) {
        const name = searchText.trim().slice(0, -1);
        const clause = getClauseDefinition(name);
        if (clause) {
          handleExpressionSelect(clause.name);
        }
      }
    },
    [handleExpressionSelect],
  );

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
    (item: Item) => {
      if (item.type === "operator") {
        handleOperatorSelect(item);
      } else if (item.type === "metric") {
        handleMetricSelect(item);
      } else if (item.type === "expression-clause") {
        handleExpressionSelect(item.clause.name);
      }
    },
    [handleOperatorSelect, handleMetricSelect, handleExpressionSelect],
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

  if (isEditingExpression) {
    return (
      <ExpressionWidget
        query={query}
        stageIndex={stageIndex}
        availableColumns={availableColumns}
        name={displayInfo?.displayName}
        clause={clause}
        withName
        expressionMode="aggregation"
        expressionIndex={clauseIndex}
        header={<ExpressionWidgetHeader onBack={closeExpressionEditor} />}
        onChangeClause={handleClauseChange}
        onClose={closeExpressionEditor}
        initialExpressionClause={initialExpressionClause}
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
    <AccordionList<Item, Section>
      data-testid="aggregation-picker"
      style={{ color: "var(--mb-color-summarize)" }}
      sections={sections}
      onChange={handleChange}
      onChangeSection={handleSectionChange}
      onChangeSearchText={handleChangeSearchText}
      itemIsSelected={checkIsItemSelected}
      renderItemName={renderItemName}
      renderItemDescription={omitItemDescription}
      renderItemExtra={renderItemIcon}
      renderItemWrapper={renderItemWrapper}
      maxHeight={Infinity}
      itemTestId="dimension-list-item"
      globalSearch
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
      <ColumnPickerHeaderTitleContainer onClick={onClick} aria-label={t`Back`}>
        <Icon name="chevronleft" size={18} />
        <Text fz="lg" fw="bold" lh="normal" c="inherit">
          {children}
        </Text>
      </ColumnPickerHeaderTitleContainer>
    </ColumnPickerHeaderContainer>
  );
}

function renderItemName(item: Item) {
  return item.displayName;
}

function renderItemWrapper(content: ReactNode) {
  return <HoverParent>{content}</HoverParent>;
}

function renderItemIcon(item: Item) {
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
          <PopoverHoverTarget name="info_filled" size={18} />
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
    (operator) => Lib.displayInfo(query, stageIndex, operator).selected,
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

function getExpressionClauseListItem(
  clause: MBQLClauseFunctionConfig,
): ExpressionClauseListItem {
  return {
    type: "expression-clause",
    clause,
    displayName: clause.displayName,
  };
}

function checkIsColumnSelected(columnInfo: Lib.ColumnDisplayInfo) {
  return !!columnInfo.selected;
}
