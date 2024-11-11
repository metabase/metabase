import { useCallback } from "react";

import { color } from "metabase/lib/colors";
import { Divider } from "metabase/ui";
import type * as Lib from "metabase-lib";

import {
  SummarizeAggregationItemList,
  SummarizeBreakoutColumnList,
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
  query,
  onQueryChange,
  onClose,
}: SummarizeSidebarProps) {
  const handleDoneClick = useCallback(() => {
    // query is updated every time `onQueryChange` is called so this just
    // reruns the query. do we need this?
    onQueryChange(query);
    onClose();
  }, [query, onQueryChange, onClose]);

  return (
    <SidebarView
      className={className}
      color={color("summarize")}
      onDone={handleDoneClick}
    >
      <SummarizeAggregationItemList
        query={query}
        onQueryChange={onQueryChange}
      />
      <Divider my="lg" />
      <SummarizeBreakoutColumnList
        query={query}
        onQueryChange={onQueryChange}
      />
    </SidebarView>
  );
}
