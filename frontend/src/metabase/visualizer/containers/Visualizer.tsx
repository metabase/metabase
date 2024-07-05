import type { Location } from "history";
import { useState } from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import type { WithRouterProps } from "react-router";
import _ from "underscore";

import ChartSettings from "metabase/visualizations/components/ChartSettings";
import type { VisualizationSettings } from "metabase-types/api";

import { useVisualizerSeries } from "../hooks/useVisualizerSeries";

import { VisualizerCanvas } from "./VisualizerCanvas";
import { VisualizerMenu } from "./VisualizerMenu/VisualizerMenu";
import { VisualizerUsed } from "./VisualizerUsed";

export function Visualizer({ location }: WithRouterProps) {
  const [isVizSettingsOpen, setVizSettingsOpen] = useState(false);

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
            <ResizeHandle direction="horizontal" />
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
      <ResizeHandle direction="vertical" />
      <Panel defaultSize={75} minSize={60}>
        <VisualizerCanvas
          series={series}
          onToggleVizSettings={() => setVizSettingsOpen(isOpen => !isOpen)}
          onChange={settings => {
            if (question) {
              setVizSettings(question.id(), settings);
            }
          }}
        />
      </Panel>
      {isVizSettingsOpen && (
        <Panel defaultSize={20} minSize={20}>
          <ChartSettings
            question={question}
            series={series}
            computedSettings={settings}
            noPreview
            onChange={(settings: VisualizationSettings) => {
              if (question) {
                setVizSettings(question.id(), settings);
              }
            }}
            onClose={() => setVizSettingsOpen(false)}
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

function ResizeHandle({ direction }: { direction: "horizontal" | "vertical" }) {
  const style =
    direction === "horizontal"
      ? { width: 20, height: 4, margin: "0 auto" }
      : { width: 4, height: 20, margin: "auto 0" };

  return (
    <PanelResizeHandle
      style={{
        display: "flex",
        margin: 4,
        cursor: direction === "horizontal" ? "row-resize" : "col-resize",
      }}
    >
      <span
        style={{
          ...style,
          backgroundColor: "#ddd",
          borderRadius: 99,
        }}
      ></span>
    </PanelResizeHandle>
  );
}
