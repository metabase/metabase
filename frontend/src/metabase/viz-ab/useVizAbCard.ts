import { useCallback, useMemo, useState } from "react";

import type { VizEvalQueryType } from "metabase/api";
import {
  skipToken,
  useGetAdhocPivotQueryQuery,
  useGetAdhocQueryQuery,
  useGetCardQuery,
  useGetCardQueryMetadataQuery,
  useGetCardQueryQuery,
  useGetNativeStructureQuery,
  useGetRandomVizEvalCardQuery,
} from "metabase/api";
import { getMetadata } from "metabase/metadata-store";
import { useSelector } from "metabase/redux";
import { chooseDefaultVizTwoStage } from "metabase/visualizations/lib/default-viz";
import type {
  Decision,
  TwoStageDecision,
} from "metabase/visualizations/lib/default-viz/types";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import { getPivotOptions } from "metabase-lib/v1/queries/utils/pivot-options";
import type {
  Card,
  CardDisplayType,
  CardId,
  DatabaseId,
  Dataset,
  Field,
  FieldId,
  VisualizationSettings,
} from "metabase-types/api";

import type { PanelSeries } from "./types";

export type VizAbFilters = {
  databaseId: DatabaseId | undefined;
  queryType: VizEvalQueryType | undefined;
  excludeJudged: boolean;
};

export type CurrentDefault = {
  display: CardDisplayType;
  settings: Partial<VisualizationSettings>;
};

type DecisionResult =
  | { status: "ok"; value: TwoStageDecision }
  | { status: "error"; message: string };

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isOneByOne(dataset: Dataset): boolean {
  return dataset.data.rows.length === 1 && dataset.data.cols.length === 1;
}

function computeCurrentDefault(
  question: Question,
  dataset: Dataset,
): CurrentDefault {
  const { display, settings = {} } = Lib.defaultDisplay(
    question.query(),
    dataset.data.cols,
  );
  const isScalarLike = ["scalar", "progress", "gauge"].includes(display);
  if (!isScalarLike && isOneByOne(dataset)) {
    return { display: "scalar", settings };
  }
  return { display, settings };
}

function buildFieldsMap(fields: Field[] | undefined): Map<FieldId, Field> {
  const entries = (fields ?? []).flatMap((field): [FieldId, Field][] =>
    typeof field.id === "number" ? [[field.id, field]] : [],
  );
  return new Map(entries);
}

function withDisplay(
  card: Card,
  display: CardDisplayType,
  settings: Partial<VisualizationSettings>,
): Card {
  return { ...card, display, visualization_settings: settings };
}

function useLoadCardWithMetadata(cardId: CardId | undefined) {
  const {
    currentData: card,
    isLoading: isLoadingCard,
    error: cardError,
  } = useGetCardQuery(cardId != null ? { id: cardId } : skipToken);
  const {
    currentData: metadata,
    isLoading: isLoadingMetadata,
    error: metadataError,
  } = useGetCardQueryMetadataQuery(cardId ?? skipToken);

  return {
    card,
    metadata,
    isLoading: isLoadingCard || isLoadingMetadata,
    error: cardError ?? metadataError,
  };
}

export function questionQueryType(question: Question): VizEvalQueryType {
  return Lib.queryDisplayInfo(question.query()).isNative ? "native" : "query";
}

export function useVizAbCard(
  filters: VizAbFilters,
  pinnedCardId: CardId | undefined,
) {
  const [nonce, setNonce] = useState(0);
  const next = useCallback(() => setNonce((value) => value + 1), []);

  const randomRequest = useMemo(
    () => ({
      database_id: filters.databaseId,
      query_type: filters.queryType,
      exclude_judged: filters.excludeJudged,
      nonce,
    }),
    [filters.databaseId, filters.queryType, filters.excludeJudged, nonce],
  );
  const {
    currentData: random,
    isFetching: isFetchingRandom,
    error: randomError,
  } = useGetRandomVizEvalCardQuery(
    pinnedCardId != null ? skipToken : randomRequest,
  );

  const cardId = pinnedCardId ?? random?.id;
  const {
    card,
    metadata: queryMetadata,
    isLoading: isLoadingCard,
    error: cardError,
  } = useLoadCardWithMetadata(cardId);
  const storeMetadata = useSelector(getMetadata);

  const question = useMemo(
    () => (card ? new Question(card, storeMetadata) : undefined),
    [card, storeMetadata],
  );

  const {
    currentData: savedDataset,
    isFetching: isFetchingSaved,
    error: savedError,
  } = useGetCardQueryQuery(cardId != null ? { cardId } : skipToken);

  const savedIsPivot = card?.display === "pivot";
  const { currentData: flatDataset, isFetching: isFetchingFlat } =
    useGetAdhocQueryQuery(
      savedIsPivot && card ? card.dataset_query : skipToken,
    );
  const dataset = savedIsPivot ? flatDataset : savedDataset;

  const isNative = question != null && questionQueryType(question) === "native";
  const {
    currentData: nativeStructure,
    isFetching: isFetchingNative,
    error: nativeError,
  } = useGetNativeStructureQuery(
    isNative && cardId != null ? { card_id: cardId } : skipToken,
  );

  const fields = useMemo(
    () => buildFieldsMap(queryMetadata?.fields),
    [queryMetadata],
  );

  const currentDefault = useMemo(
    () =>
      question && dataset && !dataset.error
        ? computeCurrentDefault(question, dataset)
        : undefined,
    [question, dataset],
  );

  const nativeReady =
    !isNative || nativeStructure != null || nativeError != null;

  const decision = useMemo((): DecisionResult | undefined => {
    if (!question || !dataset || dataset.error || !nativeReady) {
      return undefined;
    }
    try {
      const value = chooseDefaultVizTwoStage({
        query: question.query(),
        stageIndex: -1,
        resultCols: dataset.data.cols,
        rows: dataset.data.rows,
        fields,
        native: nativeStructure ?? null,
      });
      return { status: "ok", value };
    } catch (error) {
      return { status: "error", message: toErrorMessage(error) };
    }
  }, [question, dataset, fields, nativeStructure, nativeReady]);

  const [stageShown, setStageShown] = useState<1 | 2>(2);
  const shownDecision: Decision | undefined =
    decision?.status === "ok"
      ? stageShown === 1
        ? decision.value.stage1
        : decision.value.final
      : undefined;

  const newCard = useMemo(
    () =>
      card && shownDecision
        ? withDisplay(card, shownDecision.display, shownDecision.settings)
        : undefined,
    [card, shownDecision],
  );

  const pivotQuery = useMemo(() => {
    if (!newCard || !question || newCard.display !== "pivot") {
      return undefined;
    }
    const pivotQuestion = question
      .setDisplay("pivot")
      .setSettings(newCard.visualization_settings);
    return { ...newCard.dataset_query, ...getPivotOptions(pivotQuestion) };
  }, [newCard, question]);
  const { currentData: newPivotDataset, isFetching: isFetchingPivot } =
    useGetAdhocPivotQueryQuery(pivotQuery ?? skipToken);

  const savedSeries: PanelSeries | undefined =
    card && savedDataset && !savedDataset.error
      ? { card, data: savedDataset.data }
      : undefined;

  const currentSeries: PanelSeries | undefined =
    card && dataset && !dataset.error && currentDefault
      ? {
          card: withDisplay(
            card,
            currentDefault.display,
            currentDefault.settings,
          ),
          data: dataset.data,
        }
      : undefined;

  const newData =
    newCard?.display === "pivot" ? newPivotDataset?.data : dataset?.data;
  const newSeries: PanelSeries | undefined =
    newCard && newData ? { card: newCard, data: newData } : undefined;

  const isLoading =
    isFetchingRandom ||
    isLoadingCard ||
    isFetchingSaved ||
    isFetchingFlat ||
    isFetchingNative ||
    isFetchingPivot;

  const error =
    randomError ?? cardError ?? savedError ?? dataset?.error ?? undefined;

  return {
    cardId,
    card,
    question,
    dataset,
    remaining: random?.remaining,
    nativeStructure,
    nativeError,
    currentDefault,
    decision,
    shownDecision,
    stageShown,
    setStageShown,
    savedSeries,
    currentSeries,
    newSeries,
    isLoading,
    error,
    next,
  };
}
