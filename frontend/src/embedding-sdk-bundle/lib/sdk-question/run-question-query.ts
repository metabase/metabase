import type { SdkQuestionState } from "embedding-sdk-bundle/types/question";
import type { Deferred } from "metabase/lib/promise";
import { runQuestionQuery } from "metabase/services";
import { getSensibleDisplays } from "metabase/visualizations";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import { getParameterValuesBySlug } from "metabase-lib/v1/parameters/utils/parameter-values";
import type { ParameterValuesMap } from "metabase-types/api";

interface RunQuestionQueryParams {
  question: Question;
  isStaticEmbedding: boolean;
  token: string | null | undefined;
  originalQuestion?: Question;
  parameterValues?: ParameterValuesMap;
  cancelDeferred?: Deferred;
}

export async function runQuestionQuerySdk(
  params: RunQuestionQueryParams,
): Promise<SdkQuestionState> {
  let {
    question,
    isStaticEmbedding,
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

  if (shouldRunCardQuery({ question, isStaticEmbedding })) {
    const parameters = getParameterValuesBySlug(
      question.card().parameters,
      parameterValues,
    );
    const filteredParameters = Object.fromEntries(
      Object.entries(parameters).filter(([_key, value]) => value !== null),
    );

    queryResults = await runQuestionQuery(question, {
      cancelDeferred,
      ignoreCache: false,
      isDirty: isQueryDirty,
      token,
      ...(isStaticEmbedding && {
        queryParamsOverride: {
          parameters: JSON.stringify(filteredParameters),
        },
      }),
    });

    // Default values for rows/cols are needed because the `data` is missing in the case of Static Embedding
    const [{ data = isStaticEmbedding ? { rows: [], cols: [] } : undefined }] =
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
  isStaticEmbedding,
}: {
  question: Question;
  isStaticEmbedding: boolean | null;
}): boolean {
  // Static embedding questions have some fields missing, and it forces the this.legacyNativeQuery().canRun() to return `false`
  // To avoid it we just force-return true for static embedding
  if (isStaticEmbedding) {
    return true;
  }

  const query = question.query();
  const { isNative } = Lib.queryDisplayInfo(query);

  return question.canRun() && (question.isSaved() || !isNative);
}
