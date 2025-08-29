import { useEffect } from "react";
import { createPortal } from "react-dom";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { onOpenColumnPicker, onCloseColumnPicker } from "metabase/query_builder/actions/ui";
import { getIsShowingColumnPickerSidebar, getActiveColumnPickerStepId } from "metabase/query_builder/selectors";
import { ColumnPickerSidebar } from "metabase/query_builder/components/ColumnPickerSidebar/ColumnPickerSidebar";
import type * as Lib from "metabase-lib";

import type { FieldPickerItem } from "../../FieldPicker";

interface JoinTableColumnPickerDraftProps {
  query: Lib.Query;
  stageIndex: number;
  columns: Lib.ColumnMetadata[];
  selectedColumns: Lib.ColumnMetadata[];
  onChange: (newSelectedColumns: Lib.ColumnMetadata[]) => void;
  onClose: () => void;
}

export function JoinTableColumnDraftPicker({
  query,
  stageIndex,
  columns,
  selectedColumns,
  onChange,
  onClose,
}: JoinTableColumnPickerDraftProps) {
  const dispatch = useDispatch();
  const isShowingColumnPickerSidebar = useSelector(getIsShowingColumnPickerSidebar);
  const activeColumnPickerStepId = useSelector(getActiveColumnPickerStepId);
  
  // Create a unique ID for this join column picker draft
  const stepId = `join-draft-${stageIndex}`;
  const isActive = isShowingColumnPickerSidebar && activeColumnPickerStepId === stepId;
  
  useEffect(() => {
    // Open the column picker when this component mounts
    dispatch(onOpenColumnPicker(stepId));
  }, [dispatch, stepId]);
  const isColumnSelected = ({ column }: FieldPickerItem) => {
    return selectedColumns.includes(column);
  };

  const handleToggle = (column: Lib.ColumnMetadata, isSelected: boolean) => {
    const newSelectedColumns = [...selectedColumns];
    if (isSelected) {
      newSelectedColumns.push(column);
    } else {
      const columnIndex = selectedColumns.indexOf(column);
      newSelectedColumns.splice(columnIndex, 1);
    }
    onChange(newSelectedColumns);
  };

  const handleSelectAll = () => {
    onChange(columns);
  };

  const handleSelectNone = () => {
    onChange([]);
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
      isColumnSelected={isColumnSelected}
      onToggle={handleToggle}
      onSelectAll={handleSelectAll}
      onSelectNone={handleSelectNone}
      data-testid="join-columns-picker"
    />,
    targetPortal
  );
}
