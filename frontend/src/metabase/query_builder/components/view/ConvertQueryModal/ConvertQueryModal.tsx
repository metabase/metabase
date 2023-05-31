import React, { useCallback } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import { getEngineNativeType } from "metabase/lib/engine";
import Button from "metabase/core/components/Button";
import {
  getNativeQueryFn,
  getQuestion,
} from "metabase/query_builder/selectors";
import { NativeQueryForm } from "metabase-types/api";
import { State } from "metabase-types/store";
import Question from "metabase-lib/Question";

import NativeQueryModal, { useNativeQuery } from "../NativeQueryModal";

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
  onUpdateQuestion?: (question: Question, opts?: UpdateQuestionOpts) => void;
  onClose?: () => void;
}

const ConvertQueryModal = ({
  question,
  onLoadQuery,
  onUpdateQuestion,
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
    onClose?.();
  }, [question, query, onUpdateQuestion, onClose]);

  return (
    <NativeQueryModal
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
    </NativeQueryModal>
  );
};

const mapStateToProps = (state: State) => ({
  // FIXME: remove the non-null assertion operator
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  question: getQuestion(state)!,
  onLoadQuery: getNativeQueryFn(state),
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(ConvertQueryModal);
