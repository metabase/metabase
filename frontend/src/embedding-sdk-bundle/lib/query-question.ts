import {
  loadQuestionSdk,
  runQuestionQuerySdk,
} from "embedding-sdk-bundle/lib/sdk-question";
import { getIsGuestEmbed } from "embedding-sdk-bundle/store/selectors";
import type { SdkStore } from "embedding-sdk-bundle/store/types";
import type {
  MetabaseQuestion,
  SdkQuestionId,
  SqlParameterValues,
} from "embedding-sdk-bundle/types/question";
import { transformSdkQuestion } from "metabase/embedding-sdk/lib/transform-question";
import { createRawSeries } from "metabase/visualizations/lib/series";
import type { DatasetColumn, RowValues } from "metabase-types/api";

export type QueryQuestionParams = {
  questionId: SdkQuestionId;
  initialSqlParameters?: SqlParameterValues;
};

export type QueryQuestionResult = {
  id: MetabaseQuestion["id"];
  name: MetabaseQuestion["name"];
  description: MetabaseQuestion["description"];
  entityId: MetabaseQuestion["entityId"];
  rowCount: number | null;
  runningTime: number | null;
  columns: DatasetColumn[];
  rows: RowValues[];
};

export const queryQuestion =
  (reduxStore: SdkStore) =>
  async ({
    questionId,
    initialSqlParameters,
  }: QueryQuestionParams): Promise<QueryQuestionResult> => {
    const dispatch = reduxStore.dispatch;
    const getState = reduxStore.getState;
    const isGuestEmbed = getIsGuestEmbed(getState());

    const questionState = await dispatch(
      loadQuestionSdk({
        questionId,
        token: undefined,
        initialSqlParameters,
      }),
    );

    const resultState = await runQuestionQuerySdk({
      question: questionState.question,
      isGuestEmbed,
      token: undefined,
      originalQuestion: questionState.originalQuestion,
      parameterValues: questionState.parameterValues,
      signal: new AbortController().signal,
      dispatch,
    });

    const question = resultState.question ?? questionState.question;
    const transformedQuestion = transformSdkQuestion(question);
    const data = resultState.queryResults?.[0] ?? null;
    const rawSeries =
      createRawSeries({
        card: question.card(),
        queryResult: data,
      }) ?? null;

    return {
      id: transformedQuestion.id,
      name: transformedQuestion.name,
      description: transformedQuestion.description,
      entityId: transformedQuestion.entityId,
      rowCount: data?.row_count ?? null,
      runningTime: data?.running_time ?? null,
      columns: data?.data.cols ?? [],
      rows: rawSeries?.[0]?.data.rows ?? [],
    };
  };
