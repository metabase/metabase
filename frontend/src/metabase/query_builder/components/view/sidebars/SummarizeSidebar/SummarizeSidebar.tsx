import { useCallback } from "react";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { Divider } from "metabase/ui";
import type * as Lib from "metabase-lib";

import {
  useSummarizeQuery,
  SummarizeBreakoutColumnList,
  SummarizeAggregationItemList,
} from "./SummarizeContent";
import { SidebarView } from "./SummarizeSidebar.styled";

interface SummarizeSidebarProps {
  className?: string;
  query: Lib.Query;
  onQueryChange: (query: Lib.Query) => void;
  onClose: () => void;
}

export function SummarizeSidebar({
  className,
  query: initialQuery,
  onQueryChange,
  onClose,
}: SummarizeSidebarProps) {
  const {
    query,
    aggregations,
    hasAggregations,
    handleAddAggregations,
    handleUpdateAggregation,
    handleRemoveAggregation,
    handleAddBreakout,
    handleUpdateBreakout,
    handleRemoveBreakout,
    handleReplaceBreakouts,
  } = useSummarizeQuery(initialQuery, onQueryChange);

  const handleDoneClick = useCallback(() => {
    onQueryChange(query);
    onClose();
  }, [query, onQueryChange, onClose]);

  return (
    <SidebarView
      className={className}
      title={t`Summarize by`}
      color={color("summarize")}
      onDone={handleDoneClick}
    >
      <SummarizeAggregationItemList
        px="lg"
        query={query}
        aggregations={aggregations}
        onAddAggregations={handleAddAggregations}
        onUpdateAggregation={handleUpdateAggregation}
        onRemoveAggregation={handleRemoveAggregation}
      />
      <Divider my="lg" />
      {hasAggregations && (
        <SummarizeBreakoutColumnList
          px="lg"
          query={query}
          onAddBreakout={handleAddBreakout}
          onUpdateBreakout={handleUpdateBreakout}
          onRemoveBreakout={handleRemoveBreakout}
          onReplaceBreakouts={handleReplaceBreakouts}
        />
      )}
    </SidebarView>
  );
}
