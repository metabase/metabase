import { assocIn } from "icepick";
import { useMemo, useState } from "react";
import { useMount } from "react-use";

import { cardApi } from "metabase/api";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import { MetabaseApi } from "metabase/services";
import {
  extractRemappings,
  getVisualizationTransformed,
} from "metabase/visualizations";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import Question from "metabase-lib/v1/Question";
import type {
  Card,
  CardId,
  DatasetQuery,
  RawSeries,
  VisualizationSettings,
} from "metabase-types/api";

import { areSeriesCompatible } from "../utils";

const MAIN_SERIES_INDEX = 0;

export function useVisualizerSeries(initialCardIds: CardId[] = []) {
  const [rawSeries, setRawSeries] = useState<RawSeries>([]);
  const metadata = useSelector(getMetadata);
  const dispatch = useDispatch();

  const transformedSeries = useMemo(() => {
    if (rawSeries.length === 0) {
      return [];
    }
    const transformed = getVisualizationTransformed(
      extractRemappings(rawSeries),
    );
    return transformed.series;
  }, [rawSeries]);

  const mainQuestion = useMemo(() => {
    if (rawSeries.length === 0) {
      return null;
    }
    const [{ card }] = rawSeries;
    return new Question(card, metadata);
  }, [rawSeries, metadata]);

  const computedSettings = useMemo(
    () => getComputedSettingsForSeries(transformedSeries),
    [transformedSeries],
  );

  const _fetchCardAndData = async (
    cardId: CardId,
    { forceRefetch = false } = {},
  ) => {
    const { data: card } = await dispatch(
      cardApi.endpoints.getCard.initiate(
        { id: cardId },
        {
          forceRefetch,
        },
      ),
    );

    if (!card) {
      return;
    }

    const { data: dataset } = await dispatch(
      cardApi.endpoints.cardQuery.initiate(cardId, { forceRefetch }),
    );

    if (!dataset) {
      return;
    }

    await dispatch(loadMetadataForCard(card));

    return { card, data: dataset.data };
  };

  const _fetchAdHocCardData = async (card: Card) => {
    const result = await MetabaseApi.dataset(card.dataset_query);
    if (result.data) {
      await dispatch(loadMetadataForCard(card));
      return { card, data: result.data };
    }
  };

  const updateSeriesCard = async (
    index: number,
    attrs: Partial<Card>,
    { runQuery = false } = {},
  ) => {
    if (!rawSeries[index]?.card) {
      return;
    }

    if (runQuery) {
      const { card } = rawSeries[index];
      const nextCard = { ...card, ...attrs };
      const nextSeries = await _fetchAdHocCardData(nextCard);
      if (nextSeries) {
        setRawSeries(assocIn(rawSeries, [index], nextSeries));
      }
    } else {
      const nextSeries = assocIn(rawSeries, [index, "card"], {
        ...rawSeries[index].card,
        ...attrs,
      });
      setRawSeries(nextSeries);
    }
  };

  const updateSeriesQuery = async (index: number, query: DatasetQuery) => {
    const previousCard = rawSeries[index]?.card;
    if (!previousCard) {
      return;
    }
    const previousQuestion = new Question(previousCard, metadata);
    const wasSaved = previousQuestion.isSaved();
    let nextQuestion = previousQuestion
      .setDatasetQuery(query)
      .withoutNameAndId();

    let nextName = nextQuestion.generateQueryDescription();
    if (!nextName && wasSaved) {
      const previousName = previousQuestion.displayName();
      nextName = previousName + " — Modified";
    }

    nextQuestion = nextQuestion.setDisplayName(nextName);

    const nextSeries = await _fetchAdHocCardData(nextQuestion.card());

    if (nextSeries) {
      setRawSeries(assocIn(rawSeries, [index], nextSeries));
    }
  };

  const addCardSeries = async (cardId: CardId) => {
    const newSeries = await _fetchCardAndData(cardId);
    if (!newSeries) {
      return;
    }

    const [mainSeries] = rawSeries;
    const mainCard = mainSeries?.card;

    if (!mainSeries) {
      setRawSeries([newSeries]);
      return;
    }

    if (mainCard) {
      const canMerge = areSeriesCompatible(mainSeries, newSeries);
      if (canMerge) {
        setRawSeries([...rawSeries, newSeries]);
      } else {
        setRawSeries([newSeries]);
      }
    } else {
      setRawSeries([newSeries]);
    }
  };

  const replaceAllWithCardSeries = async (cardId: CardId) => {
    const newSeries = await _fetchCardAndData(cardId);
    if (newSeries) {
      setRawSeries([newSeries]);
    }
  };

  const refreshSeriesData = async (index: number) => {
    const series = rawSeries[index];

    const newSeries = series.card.id
      ? await _fetchCardAndData(series.card.id, { forceRefetch: true })
      : await _fetchAdHocCardData(series.card);

    if (newSeries) {
      const nextSeries = assocIn(rawSeries, [index], newSeries);
      setRawSeries(nextSeries);
    }
  };

  const removeSeries = (index: number) => {
    const nextSeries = rawSeries.filter((_, i) => i !== index);
    setRawSeries(nextSeries);
  };

  const setVizSettings = (settings: VisualizationSettings) => {
    updateSeriesCard(MAIN_SERIES_INDEX, { visualization_settings: settings });
  };

  useMount(() => {
    async function init() {
      const allSeries = await Promise.all(
        initialCardIds.map(cardId => _fetchCardAndData(cardId)),
      );
      const nonEmptySeries = allSeries.filter(isNotNull);
      const compatibleSeries = allSeries.filter((series, index) => {
        if (index === 0) {
          return true;
        }
        return areSeriesCompatible(nonEmptySeries[0], series);
      });
      setRawSeries(compatibleSeries);
    }
    if (initialCardIds.length > 0) {
      init();
    }
  });

  return {
    series: rawSeries,
    settings: computedSettings,
    question: mainQuestion,
    addCardSeries,
    updateSeriesCard,
    updateSeriesQuery,
    replaceAllWithCardSeries,
    refreshSeriesData,
    removeSeries,
    setVizSettings,
  };
}
