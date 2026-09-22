import cx from "classnames";
import { useCallback } from "react";
import { t } from "ttag";

import { SidebarContent } from "metabase/common/components/SidebarContent";
import { Divider } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";

import type { UpdateQueryHookProps } from "../../../../hooks/types";
import { useDefaultQueryAggregation } from "../../../../hooks/use-default-query-aggregation";

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
      color={color("core-summarize")}
      onDone={handleDoneClick}
    >
      <SummarizeAggregationItemList
        px="xl"
        query={query}
        onQueryChange={onAggregationChange}
        stageIndex={stageIndex}
      />
      <Divider my="xl" />
      {hasAggregations && (
        <SummarizeBreakoutColumnList
          px="xl"
          query={query}
          onQueryChange={onDefaultQueryChange}
          stageIndex={stageIndex}
        />
      )}
    </SidebarContent>
  );
}
