import { useState } from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import type { WithRouterProps } from "react-router";
import { useMount } from "react-use";
import _ from "underscore";

import { cardApi } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import type { CardId, RecentItem, Series } from "metabase-types/api";

import { useVizSettings } from "../useVizSettings";

import { VisualizerCanvas } from "./VisualizerCanvas";
import { VisualizerMenu } from "./VisualizerMenu/VisualizerMenu";
import { VisualizerUsed } from "./VisualizerUsed";
import { areSeriesCompatible } from "./utils";

export function Visualizer({ location }: WithRouterProps) {
  const [series, setSeries] = useState<Series>([]);
  const dispatch = useDispatch();

  const { isVizSettingsOpen, closeVizSettings } = useVizSettings();

  const cards = series.map(s => s.card);

  const _fetchCardAndData = async (cardId: CardId) => {
    const { data: card } = await dispatch(
      cardApi.endpoints.getCard.initiate({ id: cardId }),
    );

    if (!card) {
      return;
    }

    const { data: dataset } = await dispatch(
      cardApi.endpoints.cardQuery.initiate(cardId),
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

    const [mainSeries] = series;
    const mainCard = mainSeries?.card;

    if (!mainSeries) {
      setSeries([newSeries]);
      return;
    }

    if (mainCard) {
      const canMerge = areSeriesCompatible(mainSeries, newSeries);
      if (canMerge) {
        setSeries([...series, newSeries]);
      } else {
        setSeries([newSeries]);
      }
    } else {
      setSeries([newSeries]);
    }
  };

  const handleReplace = async (item: RecentItem) => {
    const newSeries = await _fetchCardAndData(item.id);
    if (newSeries) {
      setSeries([newSeries]);
    }
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
          setSeries([series1, series2]);
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
              <VisualizerUsed cards={cards} />
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
        <VisualizerCanvas series={series} />
      </Panel>
      {isVizSettingsOpen && (
        <Panel minSize={40}>
          <>
            <h1>SETTINGS</h1>
            <button onClick={() => closeVizSettings()}>Close</button>
          </>
        </Panel>
      )}
    </PanelGroup>
  );
}
