import { useDispatch } from "metabase/lib/redux";
import { updateQuestion } from "metabase/query_builder/actions";
import { ColumnPickerSidebar } from "metabase/query_builder/components/ColumnPickerSidebar/ColumnPickerSidebar";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

interface DataStepColumnPickerSidebarProps {
  question: Question;
  title?: string;
  onClose: () => void;
}

function DataStepColumnPickerSidebar({
  question,
  title,
  onClose,
}: DataStepColumnPickerSidebarProps) {
  const dispatch = useDispatch();
  const currentQuery = question.query();
  const stageIndex = Lib.stageCount(currentQuery) - 1;
  const currentColumns = Lib.fieldableColumns(currentQuery, stageIndex);

  const handleToggle = (column: Lib.ColumnMetadata, isSelected: boolean) => {
    const nextQuery = isSelected
      ? Lib.addField(currentQuery, stageIndex, column)
      : Lib.removeField(currentQuery, stageIndex, column);

    const newQuestion = question.setQuery(nextQuery);
    dispatch(updateQuestion(newQuestion));
  };

  const handleToggleSome = (
    columnsToSelectOrDeselect: Lib.ColumnMetadata[],
    isSelected: boolean,
  ) => {
    const selectedColumns = currentColumns.filter((column) => {
      const displayInfo = Lib.displayInfo(currentQuery, stageIndex, column);
      return displayInfo.selected;
    });

    let nextQuery: Lib.Query;
    if (isSelected) {
      const uniqueSelectedColumns = [
        ...new Set([...selectedColumns, ...columnsToSelectOrDeselect]),
      ];
      nextQuery = Lib.withFields(
        currentQuery,
        stageIndex,
        uniqueSelectedColumns,
      );
    } else {
      const columnsWithoutDeselected = selectedColumns.filter(
        (column) => !columnsToSelectOrDeselect.includes(column),
      );
      nextQuery = Lib.withFields(
        currentQuery,
        stageIndex,
        columnsWithoutDeselected,
      );
    }

    const newQuestion = question.setQuery(nextQuery);
    dispatch(updateQuestion(newQuestion));
  };

  const handleSelectAll = () => {
    const nextQuery = Lib.withFields(currentQuery, stageIndex, []);
    const newQuestion = question.setQuery(nextQuery);
    dispatch(updateQuestion(newQuestion));
  };

  const handleSelectNone = () => {
    const nextQuery = Lib.withFields(currentQuery, stageIndex, [
      currentColumns[0],
    ]);
    const newQuestion = question.setQuery(nextQuery);
    dispatch(updateQuestion(newQuestion));
  };

  return (
    <ColumnPickerSidebar
      onClose={onClose}
      query={currentQuery}
      stageIndex={stageIndex}
      columns={currentColumns}
      title={title}
      onToggle={handleToggle}
      onToggleSome={handleToggleSome}
      onSelectAll={handleSelectAll}
      onSelectNone={handleSelectNone}
    />
  );
}

export { DataStepColumnPickerSidebar };
