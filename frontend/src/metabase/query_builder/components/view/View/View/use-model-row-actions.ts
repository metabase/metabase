import { useCallback, useState } from "react";

import { useListActionsQuery } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { runQuestionQuery } from "metabase/query_builder/actions";
import type Question from "metabase-lib/v1/Question";
import type {
  ActionFormInitialValues,
  DatasetData,
  RowValues,
  WritebackAction,
  WritebackActionId,
} from "metabase-types/api";

export const useModelRowActions = ({
  question,
  datasetData,
}: {
  question: Question;
  datasetData: DatasetData | null | undefined;
}) => {
  const dispatch = useDispatch();

  const [activeActionState, setActiveActionState] = useState<{
    actionId: WritebackActionId;
    rowData: ActionFormInitialValues;
  } | null>(null);

  const { data: rowActions } = useListActionsQuery(
    {
      "model-id": question?.id(),
    },
    {
      skip:
        !question ||
        !question.isSaved() ||
        question.type() !== "model" ||
        question.card().display !== "table",
    },
  );

  const handleRowActionRun = useCallback(
    (action: WritebackAction, rowData: RowValues) => {
      if (!datasetData) {
        console.warn("Failed to trigger action, datasetData is null");
        return;
      }

      const remappedInitialActionValues = action.parameters?.reduce(
        (result, parameter) => {
          if (parameter.slug.startsWith("row.")) {
            const targetColumnName = parameter.slug.replace("row.", "");
            const targetColumnIndex = datasetData?.cols.findIndex((col) => {
              return col.name === targetColumnName;
            });

            if (targetColumnIndex > -1) {
              result[parameter.id] = rowData[targetColumnIndex];
            }
          }

          return result;
        },
        {} as ActionFormInitialValues,
      );

      setActiveActionState({
        actionId: action.id,
        rowData: remappedInitialActionValues || {},
      });
    },
    [datasetData],
  );

  const handleExecuteModalClose = useCallback(() => {
    setActiveActionState(null);
  }, []);

  const handleActionSuccess = useCallback(() => {
    dispatch(runQuestionQuery());
  }, [dispatch]);

  return {
    rowActions,
    handleRowActionRun,
    activeActionState,
    handleExecuteModalClose,
    handleActionSuccess,
  };
};
