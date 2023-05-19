import React, { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import AccordionList from "metabase/core/components/AccordionList";
import Icon from "metabase/components/Icon";

import * as Lib from "metabase-lib";

import QueryColumnPicker from "../QueryColumnPicker";
import { InfoIconContainer } from "./AggregationPicker.styled";

const DEFAULT_MAX_HEIGHT = 610;

interface AggregationPickerProps {
  className?: string;
  query: Lib.Query;
  operators: Lib.AggregationOperator[];
  maxHeight?: number;
  onSelect: (operator: Lib.AggregationClause) => void;
  onClose?: () => void;
}

type OperatorListItem = Lib.AggregationOperatorDisplayInfo & {
  operator: Lib.AggregationOperator;
};

type Section = {
  name: string;
  items: OperatorListItem[];
  icon?: string;
};

export function AggregationPicker({
  className,
  query,
  operators,
  maxHeight = DEFAULT_MAX_HEIGHT,
  onSelect,
  onClose,
}: AggregationPickerProps) {
  const [operator, setOperator] = useState<Lib.AggregationOperator | null>(
    null,
  );

  const sections = useMemo(() => {
    const sections: Section[] = [];
    const hasOperators = operators.length > 0;

    if (hasOperators) {
      sections.push({
        name: t`Basic Metrics`,
        items: operators.map(operator => getOperatorListItem(query, operator)),
        icon: "table2",
      });
    }

    return sections;
  }, [query, operators]);

  const handleOperatorSelect = useCallback(
    (item: OperatorListItem) => {
      if (item.requiresField) {
        setOperator(item.operator);
      } else {
        const clause = Lib.aggregationClause(item.operator);
        onSelect(clause);
        onClose?.();
      }
    },
    [onSelect, onClose],
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

  if (operator) {
    const columns = Lib.aggregationOperatorColumns(operator);
    const columnGroups = Lib.groupColumns(columns);
    return (
      <QueryColumnPicker
        className={className}
        query={query}
        columnGroups={columnGroups}
        maxHeight={maxHeight}
        onSelect={handleColumnSelect}
        onClose={onClose}
      />
    );
  }

  return (
    <AccordionList
      className={className}
      sections={sections}
      maxHeight={maxHeight}
      alwaysExpanded={false}
      onChange={handleOperatorSelect}
      renderItemName={renderItemName}
      renderItemDescription={omitItemDescription}
      renderItemExtra={renderItemExtra}
    />
  );
}

function renderItemName(item: OperatorListItem) {
  return item.displayName;
}

function omitItemDescription() {
  return null;
}

function renderItemExtra(item: OperatorListItem) {
  return (
    <InfoIconContainer>
      <Icon name="question" size={20} tooltip={item.description} />
    </InfoIconContainer>
  );
}

function getOperatorListItem(
  query: Lib.Query,
  operator: Lib.AggregationOperator,
): OperatorListItem {
  const operatorInfo = Lib.displayInfo(query, operator);
  return {
    ...operatorInfo,
    operator,
  };
}
