import { Box, useMantineTheme } from "metabase/ui";
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
  const theme = useMantineTheme();
  const isDark = theme.colorScheme === "dark";
  const [selectedMetric, setSelectedMetric] = useState<Card | undefined>();

  const handleMetricClick = (metric: Card) => {
    setSelectedMetric(metric);
  };

  return (
    <Box
      h="100vh"
      style={{ overflow: "hidden" }}
      className={isDark ? styles.dark : styles.light}
    >
      <PanelGroup direction="horizontal">
        {/* Left Panel - Metrics List */}
        <Panel defaultSize={20} minSize={15} maxSize={35}>
          <BenchPanel title="Metrics" height="100%">
            <MetricsEntitiesList
              selectedMetricId={selectedMetric?.id}
              onMetricClick={handleMetricClick}
            />
          </BenchPanel>
        </Panel>

        <PanelResizeHandle
          style={{
            width: "4px",
            backgroundColor: isDark
              ? theme.colors.dark[4]
              : theme.colors.gray[3],
            cursor: "col-resize",
            borderRadius: "2px",
            margin: "0 2px",
          }}
        />

        {/* Main Panel - Metric Details and Results */}
        <Panel defaultSize={80} minSize={50}>
          <Box
            h="100%"
            p="md"
            style={{
              backgroundColor: isDark
                ? theme.colors.dark[7]
                : theme.colors.gray[0],
            }}
          >
            {children}
          </Box>
        </Panel>
      </PanelGroup>
    </Box>
  );
}
