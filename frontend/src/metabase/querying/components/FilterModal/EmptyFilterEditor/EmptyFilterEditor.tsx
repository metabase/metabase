import { useMemo } from "react";
import { getColumnIcon } from "metabase/common/utils/columns";

import type { FilterEditorProps } from "../types";
import { FilterTitle, HoverParent } from "../FilterTitle";

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
