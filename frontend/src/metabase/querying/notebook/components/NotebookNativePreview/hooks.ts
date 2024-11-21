import { useCallback } from "react";
import { t } from "ttag";

import { useGetNativeDatasetQuery } from "metabase/api";
import { formatNativeQuery, getEngineNativeType } from "metabase/lib/engine";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import { setUIControls, updateQuestion } from "metabase/query_builder/actions";
import { getQuestion } from "metabase/query_builder/selectors";
import * as Lib from "metabase-lib";

import { createDatasetQuery } from "./utils";

const TITLE = {
  sql: t`SQL for this question`,
  json: t`Native query for this question`,
};

const BUTTON_TITLE = {
  sql: t`Convert this question to SQL`,
  json: t`Convert this question to a native query`,
};

export const useNotebookNativePreview = () => {
  const dispatch = useDispatch();
  const question = checkNotNull(useSelector(getQuestion));

  const engine = question.database()?.engine;
  const engineType = getEngineNativeType(engine);

  const sourceQuery = question.query();
  const canRun = Lib.canRun(sourceQuery, question.type());
  const payload = Lib.toLegacyQuery(sourceQuery);
  const { data, error, isFetching } = useGetNativeDatasetQuery(payload);

  const showLoader = isFetching;
  const showError = !isFetching && canRun && !!error;
  const showQuery = !isFetching && canRun && !error;

  const formattedQuery = formatNativeQuery(data?.query, engine);

  const handleConvertClick = useCallback(() => {
    if (!formattedQuery) {
      return;
    }

    const newDatasetQuery = createDatasetQuery(formattedQuery, question);
    const newQuestion = question.setDatasetQuery(newDatasetQuery);

    dispatch(updateQuestion(newQuestion, { shouldUpdateUrl: true, run: true }));
    dispatch(setUIControls({ isNativeEditorOpen: true }));
  }, [question, dispatch, formattedQuery]);

  const errorMessage = typeof error === "string" ? error : undefined;

  return {
    engineType,
    showLoader,
    formattedQuery,
    showError,
    showQuery,
    handleConvertClick,
    errorMessage,
    title: TITLE[engineType],
    buttonTitle: BUTTON_TITLE[engineType],
  };
};
