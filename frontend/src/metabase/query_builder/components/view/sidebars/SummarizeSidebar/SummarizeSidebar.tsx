import { useCallback } from "react";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { Divider } from "metabase/ui";
import type * as Lib from "metabase-lib";

import {
  SummarizeAggregationItemList,
  SummarizeBreakoutColumnList,
  useSummarizeQuery,
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
    stageIndex,
    aggregations,
    hasAggregations,
    handleQueryChange,
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
      <SummarizeAggregationItemList
        px="lg"
        query={query}
        stageIndex={stageIndex}
        aggregations={aggregations}
        onQueryChange={handleQueryChange}
      />
      <Divider my="lg" />
      {hasAggregations && (
        <SummarizeBreakoutColumnList
          px="lg"
          query={query}
          stageIndex={stageIndex}
          onAddBreakout={handleAddBreakout}
          onUpdateBreakout={handleUpdateBreakout}
          onRemoveBreakout={handleRemoveBreakout}
          onReplaceBreakouts={handleReplaceBreakouts}
        />
      )}
    </SidebarView>
  );
}
