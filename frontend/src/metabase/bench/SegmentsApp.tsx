import { Box } from "metabase/ui";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { BenchPanel } from "./components/Panel/Panel";
import { SegmentsEntitiesList } from "./components/SegmentsEntitiesList/SegmentsEntitiesList";

interface SegmentsAppProps {
  children?: React.ReactNode;
}

export function SegmentsApp({ children }: SegmentsAppProps) {
  return (
    <Box h="100vh" style={{ overflow: "hidden" }}>
      <PanelGroup direction="horizontal">
        {/* Left Panel - Segments List */}
        <Panel defaultSize={33} minSize={25} maxSize={45}>
          <BenchPanel
            title="Segments"
            height="100%"
            createNewPath="/bench/segments/new"
          >
            <SegmentsEntitiesList />
          </BenchPanel>
        </Panel>

        <PanelResizeHandle
          style={{
            width: "4px",
            cursor: "col-resize",
            borderRadius: "2px",
            margin: "0 2px",
          }}
        />

        {/* Main Panel - Segment Details and Results */}
        <Panel defaultSize={67} minSize={55}>
          <Box h="100%" p="md">
            <Box
              h="100%"
              p="lg"
              style={{
                backgroundColor: "var(--mb-color-bg-white)",
                border: "1px solid var(--mb-color-border)",
                borderRadius: "8px",
              }}
            >
              {children}
            </Box>
          </Box>
        </Panel>
      </PanelGroup>
    </Box>
  );
}
