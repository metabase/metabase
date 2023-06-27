import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import AccordionList from "metabase/core/components/AccordionList";
import { Icon } from "metabase/core/components/Icon";

import * as Lib from "metabase-lib";

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
  maxHeight?: number;
  onSelect: (operator: Lib.AggregationClause | Lib.MetricMetadata) => void;
  onClose?: () => void;
}

type OperatorListItem = Lib.AggregationOperatorDisplayInfo & {
  operator: Lib.AggregationOperator;
};

type MetricListItem = Lib.MetricDisplayInfo & {
  metric: Lib.MetricMetadata;
};

type ListItem = OperatorListItem | MetricListItem;

type Section = {
  name: string;
  items: ListItem[];
  icon?: string;
};

function isOperatorListItem(item: ListItem): item is OperatorListItem {
  return "operator" in item;
}

export function AggregationPicker({
  className,
  query,
  stageIndex,
  operators,
  maxHeight = DEFAULT_MAX_HEIGHT,
  onSelect,
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

    const metrics = Lib.availableMetrics(query);

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
        items: metrics.map(metric =>
          getMetricListItem(query, stageIndex, metric),
        ),
        icon: "star",
      });
    }

    return sections;
  }, [query, stageIndex, operators]);

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
  return item.displayName;
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

function getMetricListItem(
  query: Lib.Query,
  stageIndex: number,
  metric: Lib.MetricMetadata,
): MetricListItem {
  const metricInfo = Lib.displayInfo(query, stageIndex, metric);
  return {
    ...metricInfo,
    metric,
  };
}

function checkColumnSelected(columnInfo: Lib.ColumnDisplayInfo) {
  return !!columnInfo.selected;
}
