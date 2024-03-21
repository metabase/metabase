import { useCallback } from "react";
import { t } from "ttag";

import { useGetNativeDatasetQuery } from "metabase/api";
import { getEngineNativeType } from "metabase/lib/engine";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import { updateQuestion, setUIControls } from "metabase/query_builder/actions";
import { getQuestion } from "metabase/query_builder/selectors";
import { Button } from "metabase/ui";
import * as Lib from "metabase-lib";

import { NativeQueryPreview } from "../NativeQueryPreview";

import { createDatasetQuery } from "./utils";

const TITLE = {
  sql: t`SQL for this question`,
  json: t`Native query for this question`,
};

const BUTTON_TITLE = {
  sql: t`Convert this question to SQL`,
  json: t`Convert this question to a native query`,
};

export const NativeQueryPreviewSidebar = (): JSX.Element => {
  const dispatch = useDispatch();
  const question = checkNotNull(useSelector(getQuestion));

  const engineType = getEngineNativeType(question.database()?.engine);

  const payload = Lib.toLegacyQuery(question.query());
  const { data, error, isLoading } = useGetNativeDatasetQuery(payload);
  const query = data?.query;

  const handleConvertClick = useCallback(() => {
    if (!query) {
      return;
    }

    const newDatasetQuery = createDatasetQuery(query, question);
    const newQuestion = question.setDatasetQuery(newDatasetQuery);

    dispatch(updateQuestion(newQuestion, { shouldUpdateUrl: true, run: true }));
    dispatch(setUIControls({ isNativeEditorOpen: true }));
  }, [question, query, dispatch]);

  const getErrorMessage = (error: unknown) =>
    typeof error === "string" ? error : undefined;

  return (
    <NativeQueryPreview
      title={TITLE[engineType]}
      query={query}
      error={getErrorMessage(error)}
      isLoading={isLoading}
    >
      {query && (
        <Button variant="subtle" onClick={handleConvertClick}>
          {BUTTON_TITLE[engineType]}
        </Button>
      )}
    </NativeQueryPreview>
  );
};
