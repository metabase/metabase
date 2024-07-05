import type { Location } from "history";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import type { WithRouterProps } from "react-router";
import _ from "underscore";

import ChartSettings from "metabase/visualizations/components/ChartSettings";
import type { VisualizationSettings } from "metabase-types/api";

import { useVisualizerSeries } from "../hooks/useVisualizerSeries";
import { useVizSettings } from "../useVizSettings";

import { VisualizerCanvas } from "./VisualizerCanvas";
import { VisualizerMenu } from "./VisualizerMenu/VisualizerMenu";
import { VisualizerUsed } from "./VisualizerUsed";

export function Visualizer({ location }: WithRouterProps) {
  const {
    series,
    settings,
    question,
    addCardSeries,
    replaceAllWithCardSeries,
    refreshCardData,
    removeCardSeries,
    setCardDisplay,
    setVizSettings,
  } = useVisualizerSeries(getInitialCardIds(location));

  const { isVizSettingsOpen, closeVizSettings } = useVizSettings();

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
                onAdd={item => addCardSeries(item.id)}
                onReplace={item => replaceAllWithCardSeries(item.id)}
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
                series={series}
                onVizTypeChange={setCardDisplay}
                onRefreshCard={refreshCardData}
                onRemoveCard={removeCardSeries}
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
        <VisualizerCanvas
          series={series}
          onChange={settings => {
            if (question) {
              setVizSettings(question.id(), settings);
            }
          }}
        />
      </Panel>
      {isVizSettingsOpen && question && (
        <Panel defaultSize={20} minSize={20}>
          <ChartSettings
            question={question}
            series={series}
            computedSettings={settings}
            noPreview
            onChange={(settings: VisualizationSettings) =>
              setVizSettings(question.id(), settings)
            }
            onClose={closeVizSettings}
          />
        </Panel>
      )}
    </PanelGroup>
  );
}

function getInitialCardIds(location: Location) {
  const ids: number[] = [];
  const firstCardId = Number(location.query?.c1);
  const secondCardId = Number(location.query?.c2);
  if (Number.isSafeInteger(firstCardId)) {
    ids.push(firstCardId);
  }
  if (Number.isSafeInteger(secondCardId)) {
    ids.push(secondCardId);
  }
  return ids;
}
