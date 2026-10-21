import { useState } from "react";
import { t } from "ttag";

import { Box, Divider, Paper, Tabs, Title } from "metabase/ui";
import ChartSettingsWidget from "metabase/visualizations/components/ChartSettingsWidget";

import type { SettingWidget } from "../settings/types";
import type { AnalysisPanel } from "../use-analysis-state";

import { ResizeHandle } from "./ResizeHandle";
import S from "./SetupPanel.module.css";

// ChartSettingsWidget insets itself for the chart settings sidebar; the panel
// already provides padding here.
const WIDGET_STYLE = { marginInline: 0 };

const MIN_WIDTH = 240;
const MAX_WIDTH = 640;
const DEFAULT_WIDTH = 400;

type SetupPanelProps = {
  /** The tab that's showing. */
  tab: AnalysisPanel;
  onTabChange: (tab: AnalysisPanel) => void;
  setupLabel: string;
  widgets: SettingWidget[];
  /** The toolbar button that closes this panel is hovered. */
  isHinted?: boolean;
};

/**
 * The analysis's settings, in a setup tab and an advanced one. Its header
 * matches the segments panel's, so the two tab bars line up side by side.
 */
export const SetupPanel = ({
  tab,
  onTabChange,
  setupLabel,
  widgets,
  isHinted = false,
}: SetupPanelProps) => {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  // Column role settings aren't shown, so some analyses have nothing here.
  const hasAdvanced = getSectionWidgets(widgets, "advanced").length > 0;
  const activeTab = hasAdvanced ? tab : "setup";

  return (
    <Paper
      withBorder
      radius="md"
      className={S.root}
      w={width}
      data-hinted={isHinted}
    >
      <ResizeHandle
        className={S.handle}
        getSize={() => width}
        min={MIN_WIDTH}
        max={MAX_WIDTH}
        onResize={setWidth}
      />
      <Title order={5} px="xl" pt="lg" pb="md">
        {setupLabel}
      </Title>
      <Tabs
        value={activeTab}
        onChange={(value) =>
          onTabChange(value === "advanced" ? "advanced" : "setup")
        }
        className={S.tabs}
      >
        {/* A lone tab isn't a choice; a rule just closes off the header. */}
        {hasAdvanced ? (
          <Tabs.List px="xl">
            <Tabs.Tab value="setup">{setupLabel}</Tabs.Tab>
            <Tabs.Tab value="advanced">{t`Advanced`}</Tabs.Tab>
          </Tabs.List>
        ) : (
          <Divider />
        )}
        <Box className={S.scroll} px="xl" pt="xl">
          <SectionWidgets widgets={widgets} section={activeTab} />
        </Box>
      </Tabs>
    </Paper>
  );
};

/** Column role settings still pick their defaults; they just aren't shown. */
const getSectionWidgets = (widgets: SettingWidget[], section: AnalysisPanel) =>
  widgets.filter(
    (widget) =>
      widget.section === section &&
      !widget.hidden &&
      widget.group === undefined,
  );

type SectionWidgetsProps = {
  widgets: SettingWidget[];
  section: AnalysisPanel;
};

const SectionWidgets = ({ widgets, section }: SectionWidgetsProps) => {
  const visible = getSectionWidgets(widgets, section);
  const primary = visible.filter((widget) => !widget.secondary);
  const secondary = visible.filter((widget) => widget.secondary);
  return (
    <>
      {primary.map((widget) => (
        <ChartSettingsWidget key={widget.id} {...widget} style={WIDGET_STYLE} />
      ))}
      {secondary.length > 0 && <Divider mb="xl" />}
      {secondary.map((widget) => (
        <ChartSettingsWidget key={widget.id} {...widget} style={WIDGET_STYLE} />
      ))}
    </>
  );
};
