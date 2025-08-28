import { useMemo } from "react";

import { useDispatch } from "metabase/lib/redux";
import { updateQuestion } from "metabase/query_builder/actions";
import { ColumnPickerSidebar } from "metabase/query_builder/components/ColumnPickerSidebar/ColumnPickerSidebar";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

interface JoinStepColumnPickerSidebarProps {
  question: Question;
  title?: string;
  onClose: () => void;
}

function JoinStepColumnPickerSidebar({
  question,
  title,
  onClose,
}: JoinStepColumnPickerSidebarProps) {
  const dispatch = useDispatch();
  const currentQuery = question.query();

  // Find the stage that has joins (typically the last stage with joins)
  const stageIndex = useMemo(() => {
    for (let i = Lib.stageCount(currentQuery) - 1; i >= 0; i--) {
      const joins = Lib.joins(currentQuery, i);
      if (joins.length > 0) {
        return i;
      }
    }
    // Fallback to last stage if no joins found
    return Lib.stageCount(currentQuery) - 1;
  }, [currentQuery]);

  // Get the joins from the current query and use the last one (most recently added)
  const currentJoins = Lib.joins(currentQuery, stageIndex);
  const currentJoin = currentJoins[currentJoins.length - 1];

  if (!currentJoin) {
    return null; // No joins found, sidebar should close
  }

  const currentColumns = Lib.joinableColumns(
    currentQuery,
    stageIndex,
    currentJoin,
  );

  const handleToggle = (column: Lib.ColumnMetadata, isSelected: boolean) => {
    if (!currentJoin) {
      return;
    }

    const currentJoinFields = Lib.joinFields(currentJoin);
    let newJoinFields: Lib.ColumnMetadata[];

    // Convert current join fields to array if needed
    if (currentJoinFields === "all") {
      newJoinFields = currentColumns;
    } else if (currentJoinFields === "none") {
      newJoinFields = [];
    } else {
      newJoinFields = [...currentJoinFields];
    }

    // Add or remove the column
    if (isSelected) {
      if (
        !newJoinFields.find(
          (c) =>
            Lib.displayInfo(currentQuery, stageIndex, c).name ===
            Lib.displayInfo(currentQuery, stageIndex, column).name,
        )
      ) {
        newJoinFields.push(column);
      }
    } else {
      newJoinFields = newJoinFields.filter(
        (c) =>
          Lib.displayInfo(currentQuery, stageIndex, c).name !==
          Lib.displayInfo(currentQuery, stageIndex, column).name,
      );
    }

    const newJoin = Lib.withJoinFields(currentJoin, newJoinFields);
    const newQuery = Lib.replaceClause(
      currentQuery,
      stageIndex,
      currentJoin,
      newJoin,
    );
    const newQuestion = question.setQuery(newQuery);
    dispatch(updateQuestion(newQuestion));
  };

  const handleSelectAll = () => {
    if (currentJoin) {
      const newJoin = Lib.withJoinFields(currentJoin, "all");
      const newQuery = Lib.replaceClause(
        currentQuery,
        stageIndex,
        currentJoin,
        newJoin,
      );
      const newQuestion = question.setQuery(newQuery);
      dispatch(updateQuestion(newQuestion));
    }
  };

  const handleSelectNone = () => {
    if (currentJoin) {
      const newJoin = Lib.withJoinFields(currentJoin, "none");
      const newQuery = Lib.replaceClause(
        currentQuery,
        stageIndex,
        currentJoin,
        newJoin,
      );
      const newQuestion = question.setQuery(newQuery);
      dispatch(updateQuestion(newQuestion));
    }
  };

  const isColumnSelected = (item: any) => {
    if (!currentJoin) {
      return false;
    }

    const currentJoinFields = Lib.joinFields(currentJoin);

    if (currentJoinFields === "all") {
      return true;
    } else if (currentJoinFields === "none") {
      return false;
    } else {
      // Check if the column is in the join fields array
      const columnName = item.columnInfo.name;
      return currentJoinFields.some((field) => {
        const fieldInfo = Lib.displayInfo(currentQuery, stageIndex, field);
        return fieldInfo.name === columnName;
      });
    }
  };

  return (
    <ColumnPickerSidebar
      onClose={onClose}
      query={currentQuery}
      stageIndex={stageIndex}
      columns={currentColumns}
      title={title}
      onToggle={handleToggle}
      onSelectAll={handleSelectAll}
      onSelectNone={handleSelectNone}
      isColumnSelected={isColumnSelected}
    />
  );
}

export { JoinStepColumnPickerSidebar };
