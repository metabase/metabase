import { useMemo, useState } from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import type { WithRouterProps } from "react-router";
import { useMount } from "react-use";
import _ from "underscore";

import { cardApi } from "metabase/api";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import {
  extractRemappings,
  getVisualizationTransformed,
} from "metabase/visualizations";
import ChartSettings from "metabase/visualizations/components/ChartSettings";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import Question from "metabase-lib/v1/Question";
import type {
  CardId,
  RecentItem,
  Series,
  VisualizationSettings,
} from "metabase-types/api";

import { useVizSettings } from "../useVizSettings";

import { VisualizerCanvas } from "./VisualizerCanvas";
import { VisualizerMenu } from "./VisualizerMenu/VisualizerMenu";
import { VisualizerUsed } from "./VisualizerUsed";
import { areSeriesCompatible } from "./utils";

export function Visualizer({ location }: WithRouterProps) {
  const [rawSeries, setRawSeries] = useState<Series>([]);

  const metadata = useSelector(getMetadata);
  const dispatch = useDispatch();

  const { isVizSettingsOpen, closeVizSettings } = useVizSettings();

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

  const handleAdd = async (item: RecentItem) => {
    const newSeries = await _fetchCardAndData(item.id);
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

  const handleReplace = async (item: RecentItem) => {
    const newSeries = await _fetchCardAndData(item.id);
    if (newSeries) {
      setRawSeries([newSeries]);
    }
  };

  const handleChangeVizType = (cardId: CardId, vizType: string) => {
    const nextSeries = rawSeries.map(series =>
      series.card.id === cardId
        ? { ...series, card: { ...series.card, display: vizType } }
        : series,
    );
    setRawSeries(nextSeries);
  };

  const handleChangeVizSettings = (settings: VisualizationSettings) => {
    const mainCardId = mainQuestion?.id?.();
    if (mainCardId) {
      const nextSeries = rawSeries.map(series =>
        series.card.id === mainCardId
          ? {
              ...series,
              card: { ...series.card, visualization_settings: settings },
            }
          : series,
      );
      setRawSeries(nextSeries);
    }
  };

  const handleRefresh = async (cardId: CardId) => {
    const newSeries = await _fetchCardAndData(cardId, { forceRefetch: true });
    if (newSeries) {
      const nextSeries = rawSeries.map(series =>
        series.card.id === cardId ? newSeries : series,
      );
      setRawSeries(nextSeries);
    }
  };

  const handleRemove = (cardId: CardId) => {
    const nextSeries = rawSeries.filter(series => series.card.id !== cardId);
    setRawSeries(nextSeries);
  };

  useMount(() => {
    async function init() {
      const firstCardId = Number(location.query?.c1);
      const secondCardId = Number(location.query?.c2);

      if (
        Number.isSafeInteger(firstCardId) &&
        Number.isSafeInteger(secondCardId)
      ) {
        const [series1, series2] = await Promise.all([
          _fetchCardAndData(firstCardId),
          _fetchCardAndData(secondCardId),
        ]);

        if (series1 && series2 && areSeriesCompatible(series1, series2)) {
          setRawSeries([series1, series2]);
        }
      }
    }
    init();
  });

  const hasInitialCardsSelected =
    "c1" in location.query && "c2" in location.query;

  return (
    <PanelGroup direction="horizontal" style={{ padding: 20 }}>
      {!isVizSettingsOpen && (
        <Panel defaultSize={25} minSize={15}>
          <PanelGroup direction="vertical">
            <Panel defaultSize={70} minSize={20} maxSize={80}>
              <VisualizerMenu
                defaultTab={hasInitialCardsSelected ? "recents" : "metrics"}
                onAdd={handleAdd}
                onReplace={handleReplace}
              />
            </Panel>
            <PanelResizeHandle
              style={{
                margin: 4,
                display: "flex",
              }}
            >
              <span
                style={{
                  width: 20,
                  height: 4,
                  backgroundColor: "#ddd",
                  borderRadius: 99,
                  margin: "0 auto",
                }}
              ></span>
            </PanelResizeHandle>
            <Panel defaultSize={30}>
              <VisualizerUsed
                series={transformedSeries}
                onVizTypeChange={handleChangeVizType}
                onRefreshCard={handleRefresh}
                onRemoveCard={handleRemove}
              />
            </Panel>
          </PanelGroup>
        </Panel>
      )}
      <PanelResizeHandle
        style={{
          display: "flex",
          margin: 4,
        }}
      >
        <span
          style={{
            width: 4,
            height: 20,
            backgroundColor: "#ddd",
            borderRadius: 99,
            margin: "auto 0",
          }}
        ></span>
      </PanelResizeHandle>
      <Panel defaultSize={75} minSize={60}>
        <VisualizerCanvas series={transformedSeries} onChange={setRawSeries} />
      </Panel>
      {isVizSettingsOpen && mainQuestion && (
        <Panel defaultSize={20} minSize={20}>
          <ChartSettings
            question={mainQuestion}
            series={transformedSeries}
            computedSettings={computedSettings}
            noPreview
            onChange={handleChangeVizSettings}
            onClose={closeVizSettings}
          />
        </Panel>
      )}
    </PanelGroup>
  );
}
