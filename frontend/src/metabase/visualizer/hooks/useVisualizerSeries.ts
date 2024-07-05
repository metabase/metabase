import { useMemo, useState } from "react";
import { useMount } from "react-use";

import { cardApi } from "metabase/api";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import {
  extractRemappings,
  getVisualizationTransformed,
} from "metabase/visualizations";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import Question from "metabase-lib/v1/Question";
import type {
  Card,
  CardId,
  RawSeries,
  VisualizationSettings,
} from "metabase-types/api";

import { areSeriesCompatible } from "../utils";

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

    return { card, data: dataset.data };
  };

  const _updateCard = (cardId: CardId, attrs: Partial<Card>) => {
    const nextSeries = rawSeries.map(series =>
      series.card.id === cardId
        ? { ...series, card: { ...series.card, ...attrs } }
        : series,
    );
    setRawSeries(nextSeries);
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

  const refreshCardData = async (cardId: CardId) => {
    const newSeries = await _fetchCardAndData(cardId, { forceRefetch: true });
    if (newSeries) {
      const nextSeries = rawSeries.map(series =>
        series.card.id === cardId ? newSeries : series,
      );
      setRawSeries(nextSeries);
    }
  };

  const removeCardSeries = (cardId: CardId) => {
    const nextSeries = rawSeries.filter(series => series.card.id !== cardId);
    setRawSeries(nextSeries);
  };

  const setCardDisplay = (cardId: CardId, display: string) => {
    _updateCard(cardId, { display });
  };

  const setVizSettings = (
    cardId: CardId,
    visualization_settings: VisualizationSettings,
  ) => {
    _updateCard(cardId, { visualization_settings });
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
    replaceAllWithCardSeries,
    refreshCardData,
    removeCardSeries,
    setCardDisplay,
    setVizSettings,
  };
}
