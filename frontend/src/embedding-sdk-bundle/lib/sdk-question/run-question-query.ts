import { getGuestEmbedFilteredParameters } from "embedding-sdk-bundle/lib/get-guest-embed-filtered-parameters";
import type { SdkQuestionState } from "embedding-sdk-bundle/types/question";
import { runQuestionQuery } from "metabase/querying/run-query";
import type { Dispatch } from "metabase/redux/store";
import { getSensibleDisplays } from "metabase/visualizations";
import type Question from "metabase-lib/v1/Question";
import type { DatasetData, ParameterValuesMap } from "metabase-types/api";
import type { EntityToken } from "metabase-types/api/entity";

interface RunQuestionQueryParams {
  question: Question;
  isGuestEmbed: boolean;
  token: EntityToken | null | undefined;
  originalQuestion?: Question;
  parameterValues?: ParameterValuesMap;
  signal?: AbortSignal;
  dispatch: Dispatch;
  // Bypass the cache entirely (used by the background stale refresh).
  ignoreCache?: boolean;
  // Opt in to receiving expired cache entries flagged `stale`. The caller must refresh
  // them itself (see `useLoadQuestion`), otherwise stale data would be shown indefinitely.
  allowStale?: boolean;
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
    signal,
    dispatch,
    ignoreCache = false,
    allowStale = false,
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
      dispatch,
      signal,
      ignoreCache,
      allowStale,
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

    // `data` may be a partial (guest embed) or absent (error result); the
    // viz helpers tolerate it, matching the prior untyped behavior.
    const datasetData = data as DatasetData;
    const sensibleDisplays = getSensibleDisplays(datasetData);
    question = question.maybeResetDisplay(
      datasetData,
      sensibleDisplays,
      undefined,
    );
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
