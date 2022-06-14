import React, { useRef } from "react";
import Question from "metabase-lib/lib/Question";
import Metadata from "metabase-lib/lib/metadata/Metadata";
import Questions from "metabase/entities/questions";
import QuestionResultLoader from "metabase/containers/QuestionResultLoader";
import {
  ERROR_MESSAGE_GENERIC,
  ERROR_MESSAGE_PERMISSION,
} from "metabase/visualizations/components/Visualization";

export interface PinnedQuestionLoaderProps {
  id: number;
  metadata: Metadata;
  children: (props: PinnedQuestionChildrenProps) => JSX.Element;
}

export interface PinnedQuestionChildrenProps {
  loading: boolean;
  question?: Question;
  rawSeries?: any;
  error?: string;
  errorIcon?: string;
}

export interface QuestionLoaderProps {
  loading: boolean;
  question: any;
}

export interface QuestionResultLoaderProps {
  loading: boolean;
  error?: QuestionError;
  result?: QuestionResult;
  results?: any;
  rawSeries?: any;
}

export interface QuestionError {
  status?: number;
}

export interface QuestionResult {
  error?: QuestionError;
}

const PinnedQuestionLoader = ({
  id,
  metadata,
  children,
}: PinnedQuestionLoaderProps): JSX.Element => {
  const questionRef = useRef<Question>();

  return (
    <Questions.Loader id={id} loadingAndErrorWrapper={false}>
      {({ loading, question: card }: QuestionLoaderProps) => {
        if (loading) {
          return children({ loading: true });
        }

        const question = questionRef.current ?? new Question(card, metadata);
        questionRef.current = question;

        return (
          <QuestionResultLoader question={question} collectionPreview>
            {({
              loading,
              error,
              result,
              results,
              rawSeries,
            }: QuestionResultLoaderProps) =>
              children({
                question,
                rawSeries,
                loading: loading || results == null,
                error: getError(error, result),
                errorIcon: getErrorIcon(error, result),
              })
            }
          </QuestionResultLoader>
        );
      }}
    </Questions.Loader>
  );
};

const getError = (error?: QuestionError, result?: QuestionResult) => {
  const errorResponse = error ?? result?.error;

  if (!errorResponse) {
    return undefined;
  } else if (errorResponse.status === 403) {
    return ERROR_MESSAGE_PERMISSION;
  } else {
    return ERROR_MESSAGE_GENERIC;
  }
};

const getErrorIcon = (error?: QuestionError, result?: QuestionResult) => {
  const errorResponse = error ?? result?.error;

  if (!errorResponse) {
    return undefined;
  } else if (errorResponse.status === 403) {
    return "lock";
  } else {
    return "warning";
  }
};

export default PinnedQuestionLoader;
