import { Box } from "metabase/ui";
import { useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { BenchPanel } from "./components/Panel/Panel";
import { MetricsEntitiesList } from "./components/MetricsEntitiesList/MetricsEntitiesList";
import { MetricsDetails } from "./components/MetricsDetails/MetricsDetails";
import type { Card } from "metabase-types/api";
import styles from "./BenchApp.module.css";

interface MetricsAppProps {
  children?: React.ReactNode;
}

export function MetricsApp({ children }: MetricsAppProps) {
  const [selectedMetric, setSelectedMetric] = useState<Card | undefined>();

  const handleMetricClick = (metric: Card) => {
    setSelectedMetric(metric);
  };

  return (
    <Box h="100vh" style={{ overflow: "hidden" }}>
      <PanelGroup direction="horizontal">
        {/* Left Panel - Metrics List */}
        <Panel defaultSize={33} minSize={25} maxSize={45}>
          <BenchPanel
            title="Metrics"
            height="100%"
            createNewPath="/bench/metrics/new"
          >
            <MetricsEntitiesList
              selectedMetricId={selectedMetric?.id}
              onMetricClick={handleMetricClick}
            />
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

        {/* Main Panel - Metric Details and Results */}
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
