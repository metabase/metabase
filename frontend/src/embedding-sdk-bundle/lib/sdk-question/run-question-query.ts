import { getGuestEmbedFilteredParameters } from "embedding-sdk-bundle/lib/get-guest-embed-filtered-parameters";
import type { SdkQuestionState } from "embedding-sdk-bundle/types/question";
import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins";
import { runQuestionQuery } from "metabase/querying/run-query";
import type { Dispatch } from "metabase/redux/store";
import visualizations, { getSensibleDisplays } from "metabase/visualizations";
import type Question from "metabase-lib/v1/Question";
import type {
  DatasetData,
  ParameterValuesMap,
  QueryVisualizationDisplayType,
  VisualizationDisplay,
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

/**
 * Resolve the `initialVisualization` prop to a display that is safe to apply:
 * for `custom:*` displays the plugin must be installed, enabled, and loaded
 * successfully; for regular displays the visualization must be registered.
 * Resolves to null (keeping the question's own display) otherwise.
 */
async function resolveInitialVisualization({
  initialVisualization,
  currentDisplay,
  currentDisplayPromise,
  dispatch,
}: {
  initialVisualization: QueryVisualizationDisplayType | undefined;
  currentDisplay: string | undefined;
  currentDisplayPromise: Promise<VisualizationDisplay | null>;
  dispatch: Dispatch;
}): Promise<VisualizationDisplay | null> {
  if (!initialVisualization) {
    return Promise.resolve(null);
  }
  if (PLUGIN_CUSTOM_VIZ.isCustomVizDisplay(initialVisualization)) {
    // Avoid loading the same plugin twice when it already backs the
    // question's saved display.
    return initialVisualization === currentDisplay
      ? currentDisplayPromise
      : PLUGIN_CUSTOM_VIZ.loadCustomVizPluginForDisplay(
          dispatch,
          initialVisualization,
        );
  }
  return Promise.resolve(
    visualizations.has(initialVisualization) ? initialVisualization : null,
  );
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

    // Load the plugin backing a `custom:*` display in parallel with the
    // query, so the display is registered in the visualizations map before
    // `maybeResetDisplay` runs below.
    const display = question.display();
    const customVizPromise =
      display && PLUGIN_CUSTOM_VIZ.isCustomVizDisplay(display)
        ? PLUGIN_CUSTOM_VIZ.loadCustomVizPluginForDisplay(dispatch, display)
        : Promise.resolve(null);

    // The `initialVisualization` override resolves in parallel with the query
    // too. Resolves to null when the requested visualization doesn't exist or
    // isn't allowed, in which case the question's own display is kept.
    const initialDisplayPromise = resolveInitialVisualization({
      initialVisualization,
      currentDisplay: display,
      currentDisplayPromise: customVizPromise,
      dispatch,
    });

    queryResults = await runQuestionQuery(question, {
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
    });

    const [loadedCustomVizDisplay, initialDisplay] = await Promise.all([
      customVizPromise,
      initialDisplayPromise,
    ]);

    // Default values for rows/cols are needed because the `data` is missing in the case of Guest Embed
    const [{ data = isGuestEmbed ? { rows: [], cols: [] } : undefined }] =
      queryResults;

    // `data` may be a partial (guest embed) or absent (error result); the
    // viz helpers tolerate it, matching the prior untyped behavior.
    const datasetData = data as DatasetData;

    if (initialDisplay) {
      // Mirrors picking the visualization from the chart type dropdown:
      // lock the display so it isn't auto-reset based on the data shape.
      question = question.setDisplay(initialDisplay).lockDisplay();
    } else {
      const sensibleDisplays = getSensibleDisplays(datasetData);
      // Custom viz plugins don't implement `isSensible`, so even a loaded one
      // would be reset away by `maybeResetDisplay` — treat it as sensible.
      if (
        loadedCustomVizDisplay &&
        !sensibleDisplays.includes(loadedCustomVizDisplay)
      ) {
        sensibleDisplays.push(loadedCustomVizDisplay);
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
