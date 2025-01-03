import type { SdkQuestionState } from "embedding-sdk/types/question";
import type { Deferred } from "metabase/lib/promise";
import { runQuestionQuery } from "metabase/services";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

interface RunQuestionQueryParams {
  question: Question;
  originalQuestion?: Question;
  cancelDeferred?: Deferred;
}

export async function runQuestionQuerySdk(
  params: RunQuestionQueryParams,
): Promise<SdkQuestionState> {
  let { question, originalQuestion, cancelDeferred } = params;

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

  if (shouldRunCardQuery(question)) {
    queryResults = await runQuestionQuery(question, {
      cancelDeferred,
      ignoreCache: false,
      isDirty: isQueryDirty,
    });
  }

  // FIXME: this removes "You can also get an alert when there are some results." feature for question
  if (question) {
    question.alertType = () => null;
  }

  return { question, queryResults };
}

export function shouldRunCardQuery(question: Question): boolean {
  const query = question.query();
  const { isNative } = Lib.queryDisplayInfo(query);

  return question.canRun() && (question.isSaved() || !isNative);
}
