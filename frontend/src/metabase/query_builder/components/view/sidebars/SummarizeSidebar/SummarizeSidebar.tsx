import { useCallback } from "react";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import type * as Lib from "metabase-lib";

import { SummarizeContent, useSummarizeQuery } from "./SummarizeContent";
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
    handleAddAggregation,
    handleUpdateAggregation,
    handleRemoveAggregation,
    handleAddBreakout,
    handleUpdateBreakout,
    handleRemoveBreakout,
    handleReplaceBreakouts,
  } = useSummarizeQuery({
    query: initialQuery,
    onQueryChange,
  });

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
      <SummarizeContent
        query={query}
        aggregations={aggregations}
        hasAggregations={hasAggregations}
        onAddAggregation={handleAddAggregation}
        onUpdateAggregation={handleUpdateAggregation}
        onRemoveAggregation={handleRemoveAggregation}
        onAddBreakout={handleAddBreakout}
        onUpdateBreakout={handleUpdateBreakout}
        onRemoveBreakout={handleRemoveBreakout}
        onReplaceBreakouts={handleReplaceBreakouts}
      />
    </SidebarView>
  );
}
