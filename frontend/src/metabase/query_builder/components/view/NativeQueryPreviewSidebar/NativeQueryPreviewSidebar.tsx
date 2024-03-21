import { useCallback, useEffect } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import { useCreateNativeDatasetMutation } from "metabase/api";
import { getEngineNativeType } from "metabase/lib/engine";
import { useDispatch } from "metabase/lib/redux";
import { updateQuestion, setUIControls } from "metabase/query_builder/actions";
import { getQuestion } from "metabase/query_builder/selectors";
import { Button } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { NativeQueryForm } from "metabase-types/api";
import type { State } from "metabase-types/store";

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

interface NativeQueryPreviewSidebarProps {
  question: Question;
  onLoadQuery: () => Promise<NativeQueryForm>;
}

const NativeQueryPreviewSidebar = ({
  question,
}: NativeQueryPreviewSidebarProps): JSX.Element => {
  const dispatch = useDispatch();
  const [createNativeDataset, datasetResult] = useCreateNativeDatasetMutation();

  const engineType = getEngineNativeType(question.database()?.engine);

  useEffect(() => {
    const payload = Lib.toLegacyQuery(question.query());
    createNativeDataset(payload);
  }, [createNativeDataset, question]);

  const { data, error, isLoading } = datasetResult;
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

  return (
    <NativeQueryPreview
      title={TITLE[engineType]}
      query={query}
      error={error}
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

const mapStateToProps = (state: State) => ({
  // FIXME: remove the non-null assertion operator
  question: getQuestion(state)!,
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(NativeQueryPreviewSidebar);
