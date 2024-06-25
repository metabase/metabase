import { useState } from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";

import type { SearchResult } from "metabase-types/api";

import { VisualizerCanvas } from "./VisualizerCanvas";
import { VisualizerMenu } from "./VisualizerMenu/VisualizerMenu";
import { VisualizerUsed } from "./VisualizerUsed";

import { useVizSettings } from "../useVizSettings";

export function Visualizer() {
  const [used, setUsed] = useState<SearchResult[]>([]);

  const { isVizSettingsOpen, closeVizSettings } = useVizSettings();

  function onSetUsed(item: SearchResult) {
    setUsed([item]);
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
              <VisualizerUsed used={used} />
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
        <VisualizerCanvas used={used} />
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
