import { getGuestEmbedFilteredParameters } from "embedding-sdk-bundle/lib/get-guest-embed-filtered-parameters";
import type { SdkQuestionState } from "embedding-sdk-bundle/types/question";
import type { Deferred } from "metabase/lib/promise";
import { runQuestionQuery } from "metabase/services";
import { getSensibleDisplays } from "metabase/visualizations";
import type Question from "metabase-lib/v1/Question";
import type { ParameterValuesMap } from "metabase-types/api";
import type { EntityToken } from "metabase-types/api/entity";

interface RunQuestionQueryParams {
  question: Question;
  isGuestEmbed: boolean;
  token: EntityToken | null | undefined;
  originalQuestion?: Question;
  parameterValues?: ParameterValuesMap;
  cancelDeferred?: Deferred;
}

export async function runQuestionQuerySdk(
  params: RunQuestionQueryParams,
): Promise<SdkQuestionState> {
  let {
    question,
    isGuestEmbed,
    token,
    originalQuestion,
    parameterValues,
    cancelDeferred,
  } = params;

  if (question.isSaved()) {
    const type = question.type();

    if (type === "question") {
      question = question.lockDisplay();
    }
  }

  const isQueryDirty = originalQuestion
    ? question.isQueryDirtyComparedTo(originalQuestion)
    : true;

  let queryResults;

  if (shouldRunCardQuery({ question, isGuestEmbed })) {
    const filteredParameters = getGuestEmbedFilteredParameters(
      question,
      parameterValues,
    );

    queryResults = await runQuestionQuery(question, {
      cancelDeferred,
      ignoreCache: false,
      isDirty: isQueryDirty,
      token,
      ...(isGuestEmbed && {
        queryParamsOverride: {
          parameters: JSON.stringify(filteredParameters),
        },
      }),
    });

    // Default values for rows/cols are needed because the `data` is missing in the case of Guest Embed
    const [{ data = isGuestEmbed ? { rows: [], cols: [] } : undefined }] =
      queryResults;

    const sensibleDisplays = getSensibleDisplays(data);
    question = question.maybeResetDisplay(data, sensibleDisplays, undefined);
  }

  // FIXME: this removes "You can also get an alert when there are some results." feature for question
  if (question) {
    question.alertType = () => null;
  }

  return { question, queryResults };
}

export function shouldRunCardQuery({
  question,
  isGuestEmbed,
}: {
  question: Question;
  isGuestEmbed: boolean | null;
}): boolean {
  // Questions fetched from `/api/embed/*` endpoints have some fields missing, and it forces the this.legacyNativeQuery().canRun() to return `false`
  // To avoid it we just force-return true
  if (isGuestEmbed) {
    return true;
  }

  return question.canRun();
}
