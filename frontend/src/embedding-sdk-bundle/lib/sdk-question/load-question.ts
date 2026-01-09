import { getIsGuestEmbed } from "embedding-sdk-bundle/store/selectors";
import type {
  SdkDispatch,
  SdkStoreState,
} from "embedding-sdk-bundle/store/types";
import type {
  LoadSdkQuestionParams,
  SdkQuestionState,
} from "embedding-sdk-bundle/types/question";
import { resolveCards } from "metabase/query_builder/actions";
import { getParameterValuesForQuestion } from "metabase/query_builder/actions/core/parameterUtils";
import { loadMetadataForCard } from "metabase/questions/actions";
import { addFields } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import type { EntityToken } from "metabase-types/api/entity";

type LoadQuestionSdkParams = LoadSdkQuestionParams & {
  token: EntityToken | null | undefined;
};

export const loadQuestionSdk =
  ({
    options = {},
    deserializedCard,
    questionId: initQuestionId,
    token,
    initialSqlParameters,
    targetDashboardId,
  }: LoadQuestionSdkParams) =>
  async (
    dispatch: SdkDispatch,
    getState: () => SdkStoreState,
  ): Promise<
    Required<Pick<SdkQuestionState, "question">> &
      Pick<SdkQuestionState, "originalQuestion" | "parameterValues">
  > => {
    const isGuestEmbed = getIsGuestEmbed(getState());

    const isNewQuestion = initQuestionId === "new";
    const questionId = isNewQuestion ? undefined : initQuestionId;

    const { card: resolvedCard, originalCard } = await resolveCards({
      cardId: questionId ?? undefined,
      token,
      options,
      dispatch,
      getState,
      deserializedCard,
    });

    const card = isNewQuestion
      ? { ...resolvedCard, creationType: "custom_question" }
      : resolvedCard;

    if (!isGuestEmbed) {
      // We don't have a `metadata` endpoint for static/guest embeds
      await dispatch(loadMetadataForCard(card, { token }));
    }

    const metadata = getMetadata(getState());

    const originalQuestion =
      originalCard && new Question(originalCard, metadata);

    let question = new Question(card, metadata);
    if (targetDashboardId) {
      question = question.setDashboardId(targetDashboardId);
    }

    // In Legacy Static Embedding we didn't have this logic,
    // it breaks behavior when a parameter is disabled.
    if (!isGuestEmbed) {
      question = question.applyTemplateTagParameters();
    }

    const parameterValues = getParameterValuesForQuestion({
      card,
      metadata,
      queryParams: initialSqlParameters,
    });

    if (parameterValues) {
      question = question.setParameterValues(parameterValues);
    }

    if ("param_fields" in card && card.param_fields) {
      // This is needed to make some parameter widget populate the dropdown list
      // otherwise they will use a normal text input
      dispatch(addFields(Object.values(card.param_fields).flat()));
    }

    return { question, originalQuestion, parameterValues };
  };
