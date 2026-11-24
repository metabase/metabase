import { useState } from "react";
import { t } from "ttag";

import { Box, Group, Paper, Title } from "metabase/ui";
import ChartSettingsWidget from "metabase/visualizations/components/ChartSettingsWidget";

import type { AnalysisSettingWidget } from "../analyses/config";

import { PanelCloseButton } from "./PanelCloseButton";
import { ResizeHandle } from "./ResizeHandle";
import S from "./SetupPanel.module.css";

// ChartSettingsWidget insets itself for the chart settings sidebar; the panel
// pads its content already.
const WIDGET_STYLE = { marginInline: 0 };

const MIN_WIDTH = 240;
const MAX_WIDTH = 640;
const DEFAULT_WIDTH = 360;

type SetupPanelProps = {
  widgets: AnalysisSettingWidget[];
  onClose: () => void;
};

/** The analysis's settings, as widgets under a heading. Its width can be dragged. */
export const SetupPanel = ({ widgets, onClose }: SetupPanelProps) => {
  const [width, setWidth] = useState(DEFAULT_WIDTH);

  return (
    <Paper
      className={S.root}
      component="section"
      aria-label={t`Setup`}
      withBorder
      radius="md"
      style={{ width }}
    >
      <ResizeHandle
        className={S.handle}
        getWidth={() => width}
        minWidth={MIN_WIDTH}
        maxWidth={MAX_WIDTH}
        onResize={setWidth}
      />
      <Group justify="space-between" wrap="nowrap" px="xl" pt="lg">
        <Title order={4}>{t`Setup`}</Title>
        <PanelCloseButton onClose={onClose} />
      </Group>
      <Box flex={1} mih={0} px="xl" pt="xl" style={{ overflowY: "auto" }}>
        {widgets.map((widget) => (
          <ChartSettingsWidget
            key={widget.id}
            {...widget}
            style={WIDGET_STYLE}
          />
        ))}
      </Box>
    </Paper>
  );
};
