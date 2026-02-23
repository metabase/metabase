import cx from "classnames";
import { useCallback } from "react";
import { t } from "ttag";

import { SidebarContent } from "metabase/query_builder/components/SidebarContent";
import type { UpdateQueryHookProps } from "metabase/query_builder/hooks/types";
import { useDefaultQueryAggregation } from "metabase/query_builder/hooks/use-default-query-aggregation";
import { Divider } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";

import {
  SummarizeAggregationItemList,
  SummarizeBreakoutColumnList,
} from "./SummarizeContent";
import SummarizeSidebarS from "./SummarizeSidebar.module.css";

type SummarizeSidebarProps = {
  className?: string;
  onClose: () => void;
} & UpdateQueryHookProps;

export function SummarizeSidebar({
  className,
  query: initialQuery,
  onQueryChange,
  onClose,
  stageIndex,
}: SummarizeSidebarProps) {
  const {
    query,
    onUpdateQuery: onDefaultQueryChange,
    onAggregationChange,
    hasAggregations,
  } = useDefaultQueryAggregation({
    query: initialQuery,
    onQueryChange,
    stageIndex,
  });

  const handleDoneClick = useCallback(() => {
    onQueryChange(query);
    onClose();
  }, [query, onQueryChange, onClose]);

  return (
    <SidebarContent
      className={cx(SummarizeSidebarS.SidebarView, className)}
      title={t`Summarize by`}
      color={color("summarize")}
      onDone={handleDoneClick}
    >
      <SummarizeAggregationItemList
        px="lg"
        query={query}
        onQueryChange={onAggregationChange}
        stageIndex={stageIndex}
      />
      <Divider my="lg" />
      {hasAggregations && (
        <SummarizeBreakoutColumnList
          px="lg"
          query={query}
          onQueryChange={onDefaultQueryChange}
          stageIndex={stageIndex}
        />
      )}
    </SidebarContent>
  );
}
