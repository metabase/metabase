import { useMemo } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { updateQuestion } from "metabase/query_builder/actions";
import { ColumnPickerSidebar } from "metabase/query_builder/components/ColumnPickerSidebar/ColumnPickerSidebar";
import { getUiControls } from "metabase/query_builder/selectors";
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
  const { columnPickerSidebarData } = useSelector(getUiControls);

  const stageIndex = useMemo(() => {
    if (
      columnPickerSidebarData?.type === "join-step" &&
      columnPickerSidebarData.stageIndex !== undefined
    ) {
      return columnPickerSidebarData.stageIndex;
    }

    for (let i = Lib.stageCount(currentQuery) - 1; i >= 0; i--) {
      const joins = Lib.joins(currentQuery, i);
      if (joins.length > 0) {
        return i;
      }
    }

    return Lib.stageCount(currentQuery) - 1;
  }, [currentQuery, columnPickerSidebarData]);

  const currentJoin = useMemo(() => {
    const joins = Lib.joins(currentQuery, stageIndex);

    if (
      columnPickerSidebarData?.type === "join-step" &&
      columnPickerSidebarData.joinIndex !== undefined
    ) {
      return joins[columnPickerSidebarData.joinIndex] || null;
    }

    return joins[joins.length - 1] || null;
  }, [currentQuery, stageIndex, columnPickerSidebarData]);

  if (!currentJoin) {
    return null;
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

    if (currentJoinFields === "all") {
      newJoinFields = currentColumns;
    } else if (currentJoinFields === "none") {
      newJoinFields = [];
    } else {
      newJoinFields = [...currentJoinFields];
    }

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
