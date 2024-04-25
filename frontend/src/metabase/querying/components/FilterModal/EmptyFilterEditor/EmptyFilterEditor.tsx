import { useMemo } from "react";

import { getColumnIcon } from "metabase/common/utils/columns";

import { FilterTitle, HoverParent } from "../FilterTitle";
import type { FilterEditorProps } from "../types";

export function EmptyFilterEditor({
  query,
  stageIndex,
  column,
}: FilterEditorProps) {
  const columnIcon = useMemo(() => {
    return getColumnIcon(column);
  }, [column]);

  return (
    <HoverParent>
      <FilterTitle
        query={query}
        stageIndex={stageIndex}
        column={column}
        columnIcon={columnIcon}
        isSearching={false}
      />
    </HoverParent>
  );
}
