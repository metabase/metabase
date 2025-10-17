import { Panel, PanelGroup } from "react-resizable-panels";

import { ResizeHandle } from "metabase/bench/components/BenchApp";

export const TransformPageLayout = ({
  editor,
  drawer,
}: {
  editor: React.ReactNode;
  drawer: React.ReactNode;
}) => (
  <PanelGroup
    autoSaveId="transforms-editor-panel-layout"
    direction="vertical"
    style={{ height: "100%", width: "100%" }}
  >
    <Panel>{editor}</Panel>
    <ResizeHandle direction="vertical" />
    <Panel minSize={5} style={{ backgroundColor: "transparent" }}>
      {drawer}
    </Panel>
  </PanelGroup>
);
