import { useCallback } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import { getEngineNativeType } from "metabase/lib/engine";
import { useDispatch } from "metabase/lib/redux";
import { updateQuestion, setUIControls } from "metabase/query_builder/actions";
import {
  getNativeQueryFn,
  getQuestion,
} from "metabase/query_builder/selectors";
import type Question from "metabase-lib/v1/Question";
import type { NativeQueryForm } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { NativeQueryPreview, useNativeQuery } from "../NativeQueryPreview";

import { createDatasetQuery } from "./utils";

const MODAL_TITLE = {
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
  onClose?: () => void;
}

const NativeQueryPreviewSidebar = ({
  question,
  onLoadQuery,
  onClose,
}: NativeQueryPreviewSidebarProps): JSX.Element => {
  const engineType = getEngineNativeType(question.database()?.engine);
  const { query, error, isLoading } = useNativeQuery(question, onLoadQuery);
  const dispatch = useDispatch();

  const handleConvertClick = useCallback(() => {
    if (!query) {
      return;
    }

    const newDatasetQuery = createDatasetQuery(query, question);
    const newQuestion = question.setDatasetQuery(newDatasetQuery);

    dispatch(updateQuestion(newQuestion, { shouldUpdateUrl: true, run: true }));
    dispatch(setUIControls({ isNativeEditorOpen: true }));

    onClose?.();
  }, [question, query, onClose, dispatch]);

  return (
    <NativeQueryPreview
      title={MODAL_TITLE[engineType]}
      query={query}
      error={error}
      isLoading={isLoading}
      onClose={onClose}
    >
      {query && (
        <Button primary onClick={handleConvertClick}>
          {BUTTON_TITLE[engineType]}
        </Button>
      )}
    </NativeQueryPreview>
  );
};

const mapStateToProps = (state: State) => ({
  // FIXME: remove the non-null assertion operator
  question: getQuestion(state)!,
  onLoadQuery: getNativeQueryFn(state),
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(NativeQueryPreviewSidebar);
