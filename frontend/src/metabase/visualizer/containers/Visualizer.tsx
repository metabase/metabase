import { useState } from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";

import { cardApi } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import type { Card, Series } from "metabase-types/api";

import { useVizSettings } from "../useVizSettings";

import { VisualizerCanvas } from "./VisualizerCanvas";
import { VisualizerMenu } from "./VisualizerMenu/VisualizerMenu";
import { VisualizerUsed } from "./VisualizerUsed";
import { areSeriesCompatible } from "./utils";

export function Visualizer() {
  const [series, setSeries] = useState<Series>([]);
  const dispatch = useDispatch();

  const { isVizSettingsOpen, closeVizSettings } = useVizSettings();

  const cards = series.map(s => s.card);

  async function onSetUsed(card: Card) {
    const { data: dataset } = await dispatch(
      cardApi.endpoints.cardQuery.initiate(card.id),
    );

    if (!dataset) {
      return;
    }

    const newSeries = { card, data: dataset.data };

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
  }

  return (
    <PanelGroup direction="horizontal" style={{ padding: 20 }}>
      {!isVizSettingsOpen && (
        <Panel defaultSize={25} minSize={15}>
          <PanelGroup direction="vertical">
            <Panel defaultSize={70} minSize={20} maxSize={80}>
              <VisualizerMenu setUsed={onSetUsed} />
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
