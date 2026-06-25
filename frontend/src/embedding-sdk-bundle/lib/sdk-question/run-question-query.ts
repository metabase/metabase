import { getGuestEmbedFilteredParameters } from "embedding-sdk-bundle/lib/get-guest-embed-filtered-parameters";
import type { SdkQuestionState } from "embedding-sdk-bundle/types/question";
import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins";
import { runQuestionQuery } from "metabase/querying/run-query";
import type { Dispatch } from "metabase/redux/store";
import { isNotNull } from "metabase/utils/types";
import visualizations, { getSensibleDisplays } from "metabase/visualizations";
import type Question from "metabase-lib/v1/Question";
import type {
  DatasetData,
  ParameterValuesMap,
  QueryVisualizationDisplayType,
} from "metabase-types/api";
import type { EntityToken } from "metabase-types/api/entity";

interface RunQuestionQueryParams {
  question: Question;
  isGuestEmbed: boolean;
  token: EntityToken | null | undefined;
  originalQuestion?: Question;
  parameterValues?: ParameterValuesMap;
  signal?: AbortSignal;
  dispatch: Dispatch;
  initialVisualization?: QueryVisualizationDisplayType;
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
    initialVisualization,
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

    const display = question.display();

    // We try to load both the `initialVisualization` override (if provided) and
    // the saved question's current display in case the override fails to load
    // or is not enabled
    const customDisplaysToLoad = [
      ...new Set(
        [display, initialVisualization].filter(
          PLUGIN_CUSTOM_VIZ.isCustomVizDisplay,
        ),
      ),
    ];

    const loadCustomDisplays = async () =>
      new Set(
        (
          await Promise.all(
            customDisplaysToLoad.map((customDisplay) =>
              PLUGIN_CUSTOM_VIZ.loadCustomVizPluginForDisplay(
                dispatch,
                customDisplay,
              ),
            ),
          )
        ).filter(isNotNull),
      );

    // The query and the custom-viz load are independent, so run them
    // concurrently.
    const [results, loadedDisplays] = await Promise.all([
      runQuestionQuery(question, {
        dispatch,
        signal,
        ignoreCache: false,
        isDirty: isQueryDirty,
        token,
        ...(isGuestEmbed && {
          queryParamsOverride: {
            parameters: JSON.stringify(filteredParameters),
          },
        }),
      }),
      loadCustomDisplays(),
    ]);
    queryResults = results;

    const isDisplayAvailable = (d: QueryVisualizationDisplayType) =>
      PLUGIN_CUSTOM_VIZ.isCustomVizDisplay(d)
        ? loadedDisplays.has(d)
        : visualizations.has(d);

    const initialDisplay =
      initialVisualization && isDisplayAvailable(initialVisualization)
        ? initialVisualization
        : null;

    // Default values for rows/cols are needed because the `data` is missing in the case of Guest Embed
    const [{ data = isGuestEmbed ? { rows: [], cols: [] } : undefined }] =
      queryResults;

    // `data` may be a partial (guest embed) or absent (error result); the
    // viz helpers tolerate it, matching the prior untyped behavior.
    const datasetData = data as DatasetData;

    if (initialDisplay) {
      // Mirrors picking the visualization from the chart-type dropdown:
      // lock it so the data shape doesn't auto-reset it.
      question = question.setDisplay(initialDisplay).lockDisplay();
    } else {
      // Built-in sensibles only (custom viz never report sensible, no `isSensible`),
      // plus the current display if it's a custom viz that loaded this run.
      const sensibleDisplays = getSensibleDisplays(datasetData).filter(
        (d) => !PLUGIN_CUSTOM_VIZ.isCustomVizDisplay(d),
      );
      if (loadedDisplays.has(display)) {
        sensibleDisplays.push(display);
      }
      question = question.maybeResetDisplay(
        datasetData,
        sensibleDisplays,
        undefined,
      );
    }
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
