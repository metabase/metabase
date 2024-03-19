import { useCallback } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import { getEngineNativeType } from "metabase/lib/engine";
import {
  getNativeQueryFn,
  getQuestion,
} from "metabase/query_builder/selectors";
import type Question from "metabase-lib/Question";
import type { NativeQueryForm } from "metabase-types/api";
import type { QueryBuilderUIControls, State } from "metabase-types/store";

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

interface UpdateQuestionOpts {
  shouldUpdateUrl?: boolean;
}

interface ConvertQueryModalProps {
  question: Question;
  onLoadQuery: () => Promise<NativeQueryForm>;
  onUpdateQuestion: (question: Question, opts?: UpdateQuestionOpts) => void;
  onSetUIControls: (changes: Partial<QueryBuilderUIControls>) => void;
  onClose?: () => void;
}

const ConvertQueryModal = ({
  question,
  onLoadQuery,
  onUpdateQuestion,
  onSetUIControls,
  onClose,
}: ConvertQueryModalProps): JSX.Element => {
  const engineType = getEngineNativeType(question.database()?.engine);
  const { query, error, isLoading } = useNativeQuery(question, onLoadQuery);

  const handleConvertClick = useCallback(() => {
    if (!query) {
      return;
    }

    const newDatasetQuery = createDatasetQuery(query, question);
    const newQuestion = question.setDatasetQuery(newDatasetQuery);

    onUpdateQuestion?.(newQuestion, { shouldUpdateUrl: true });
    onSetUIControls({ isNativeEditorOpen: true });
    onClose?.();
  }, [question, query, onUpdateQuestion, onSetUIControls, onClose]);

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
export default connect(mapStateToProps)(ConvertQueryModal);
