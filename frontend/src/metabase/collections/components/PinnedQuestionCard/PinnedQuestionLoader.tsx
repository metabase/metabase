import { useMemo } from "react";

import { useGetCardQuery } from "metabase/api";
import { QuestionResultLoader } from "metabase/common/components/QuestionResultLoader";
import { getResponseErrorMessage } from "metabase/lib/errors";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import type { IconName } from "metabase/ui";
import {
  getGenericErrorMessage,
  getPermissionErrorMessage,
} from "metabase/visualizations/lib/errors";
import Question from "metabase-lib/v1/Question";
import type { RawSeries } from "metabase-types/api";

export interface PinnedQuestionLoaderProps {
  id: number;
  children: (props: PinnedQuestionChildrenProps) => JSX.Element;
}

export interface PinnedQuestionChildrenProps {
  loading: boolean;
  question?: Question;
  rawSeries?: RawSeries;
  error?: string;
  errorIcon?: IconName;
}

export interface QuestionResultLoaderProps {
  loading: boolean;
  error?: any;
  result?: any;
  results?: any;
  rawSeries?: RawSeries;
}

const PinnedQuestionLoader = ({
  id,
  children,
}: PinnedQuestionLoaderProps): JSX.Element => {
  const {
    data: card,
    error,
    isLoading,
  } = useGetCardQuery({
    id,
    context: "collection",
  });

  const metadata = useSelector(getMetadata);
  const question = useMemo(() => {
    return card ? new Question(card, metadata) : undefined;
  }, [card, metadata]);

  if (isLoading) {
    return children({
      loading: true,
    });
  }

  if (!question) {
    return children({
      error: getResponseErrorMessage(error),
      errorIcon: "warning",
      loading: false,
    });
  }

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
};

const getRawSeries = (rawSeries?: any[]) => {
  return rawSeries?.map((series) => ({
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
