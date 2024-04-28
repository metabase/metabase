import { useRef } from "react";

import QuestionResultLoader from "metabase/containers/QuestionResultLoader";
import Questions from "metabase/entities/questions";
import {
  getGenericErrorMessage,
  getPermissionErrorMessage,
} from "metabase/visualizations/lib/errors";
import type Question from "metabase-lib/v1/Question";

export interface PinnedQuestionLoaderProps {
  id: number;
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
  question: Question;
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
  children,
}: PinnedQuestionLoaderProps): JSX.Element => {
  const questionRef = useRef<Question>();

  return (
    <Questions.Loader id={id} loadingAndErrorWrapper={false}>
      {({ loading, question: loadedQuestion }: QuestionLoaderProps) => {
        if (loading !== false) {
          return children({ loading: true });
        }

        const question = questionRef.current ?? loadedQuestion;
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
    return getPermissionErrorMessage();
  } else {
    return getGenericErrorMessage();
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default PinnedQuestionLoader;
