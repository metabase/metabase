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
  rawSeries?: any[];
  error?: string;
  errorIcon?: string;
}

export interface QuestionLoaderProps {
  loading: boolean;
  question: any;
}

export interface QuestionResultLoaderProps {
  loading: boolean;
  error?: any;
  result?: any;
  results?: any;
  rawSeries?: any[];
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
        if (loading || !card.dataset_query) {
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
                loading: loading || results == null,
                rawSeries: getRawSeries(rawSeries),
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

const getRawSeries = (rawSeries?: any[]) => {
  return rawSeries?.map(series => ({
    ...series,
    card: {
      ...series.card,
      visualization_settings: {
        ...series.card.visualization_settings,
        "graph.show_values": false,
        "graph.x_axis.labels_enabled": false,
        "graph.y_axis.labels_enabled": false,
      },
    },
  }));
};

const getError = (error?: any, result?: any) => {
  const errorResponse = error ?? result?.error;

  if (!errorResponse) {
    return undefined;
  } else if (errorResponse.status === 403) {
    return ERROR_MESSAGE_PERMISSION;
  } else {
    return ERROR_MESSAGE_GENERIC;
  }
};

const getErrorIcon = (error?: any, result?: any) => {
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
