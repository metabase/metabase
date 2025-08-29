import { useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { onOpenColumnPicker, onCloseColumnPicker } from "metabase/query_builder/actions/ui";
import { getIsShowingColumnPickerSidebar, getActiveColumnPickerStepId } from "metabase/query_builder/selectors";
import { ColumnPickerSidebar } from "metabase/query_builder/components/ColumnPickerSidebar/ColumnPickerSidebar";
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
  onClose,
}: JoinTableColumnPickerProps) {
  const dispatch = useDispatch();
  const isShowingColumnPickerSidebar = useSelector(getIsShowingColumnPickerSidebar);
  const activeColumnPickerStepId = useSelector(getActiveColumnPickerStepId);
  
  // Create a unique ID for this join column picker
  const stepId = `join-${stageIndex}-${Lib.displayInfo(query, stageIndex, join).name}`;
  const isActive = isShowingColumnPickerSidebar && activeColumnPickerStepId === stepId;
  
  const columns = useMemo(
    () => Lib.joinableColumns(query, stageIndex, join),
    [query, stageIndex, join],
  );
  
  useEffect(() => {
    // Open the column picker when this component mounts
    dispatch(onOpenColumnPicker(stepId));
  }, [dispatch, stepId]);

  const handleToggle = (column: Lib.ColumnMetadata, isSelected: boolean) => {
    const newQuery = isSelected
      ? Lib.addField(query, stageIndex, column)
      : Lib.removeField(query, stageIndex, column);
    onChange(newQuery);
  };

  const handleSelectAll = () => {
    const newJoin = Lib.withJoinFields(join, "all");
    const newQuery = Lib.replaceClause(query, stageIndex, join, newJoin);
    onChange(newQuery);
  };

  const handleSelectNone = () => {
    const newJoin = Lib.withJoinFields(join, "none");
    const newQuery = Lib.replaceClause(query, stageIndex, join, newJoin);
    onChange(newQuery);
  };

  // Only render if this specific step is the active column picker
  if (!isActive) {
    return null;
  }

  // Try resizable portal first, fallback to regular portal
  const resizablePortal = document.getElementById("notebook-column-picker-portal-resizable");
  const regularPortal = document.getElementById("notebook-column-picker-portal");
  const targetPortal = resizablePortal || regularPortal;
  
  if (!targetPortal) {
    return null;
  }
  
  const handleClose = () => {
    dispatch(onCloseColumnPicker());
    onClose();
  };
  
  return createPortal(
    <ColumnPickerSidebar
      isOpen={isActive}
      onClose={handleClose}
      query={query}
      stageIndex={stageIndex}
      columns={columns}
      title={t`Pick columns`}
      onToggle={handleToggle}
      onSelectAll={handleSelectAll}
      onSelectNone={handleSelectNone}
      data-testid="join-columns-picker-sidebar"
    />,
    targetPortal
  );
}
