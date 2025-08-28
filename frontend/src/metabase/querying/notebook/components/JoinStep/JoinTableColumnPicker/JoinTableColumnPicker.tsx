import { useMemo } from "react";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { setUIControls } from "metabase/query_builder/actions";
import * as Lib from "metabase-lib";

interface JoinTableColumnPickerProps {
  query: Lib.Query;
  stageIndex: number;
  join: Lib.Join;
  onChange: (newQuery: Lib.Query) => void;
  onClose: () => void;
}

export function JoinTableColumnPicker({
  query,
  stageIndex,
  join,
  onChange,
  onClose: _onClose,
}: JoinTableColumnPickerProps) {
  const dispatch = useDispatch();

  const columns = useMemo(
    () => Lib.joinableColumns(query, stageIndex, join),
    [query, stageIndex, join],
  );

  // Open the sidebar using Redux instead of rendering directly
  const _openSidebar = () => {
    dispatch(
      setUIControls({
        isShowingColumnPickerSidebar: true,
        columnPickerSidebarData: {
          type: "join-step",
          title: t`Pick columns`,
          query,
          stageIndex,
          columns,
          join,
          onChange,
        },
      }),
    );
  };

  // For backward compatibility, we'll expose this function
  // but the actual rendering will be handled by NotebookContainer
  return null;
}
