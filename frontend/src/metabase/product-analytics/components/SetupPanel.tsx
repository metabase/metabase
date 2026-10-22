import { useState } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Divider,
  Group,
  Icon,
  Paper,
  Tabs,
} from "metabase/ui";
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
const DEFAULT_WIDTH = 360;

type SetupPanelProps = {
  /** The tab that's showing. */
  tab: AnalysisPanel;
  onTabChange: (tab: AnalysisPanel) => void;
  setupLabel: string;
  widgets: SettingWidget[];
  /** The toolbar button that closes this panel is hovered. */
  isHinted?: boolean;
  onClose: () => void;
};

/**
 * The analysis's settings, in a setup tab and an advanced one. Its tab bar
 * sits at the top like the segments panel's, so the two line up side by side.
 */
export const SetupPanel = ({
  tab,
  onTabChange,
  setupLabel,
  widgets,
  isHinted = false,
  onClose,
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
      <Tabs
        value={activeTab}
        onChange={(value) =>
          onTabChange(value === "advanced" ? "advanced" : "setup")
        }
        className={S.tabs}
      >
        {/* A lone tab isn't a choice, so there's no tab bar then. */}
        {hasAdvanced ? (
          <Tabs.List px="xl" pt="sm">
            <Tabs.Tab value="setup">{setupLabel}</Tabs.Tab>
            <Tabs.Tab value="advanced">{t`Advanced`}</Tabs.Tab>
            <CloseButton onClose={onClose} />
          </Tabs.List>
        ) : (
          <Group justify="flex-end" px="md" pt="sm">
            <CloseButton onClose={onClose} />
          </Group>
        )}
        <Box className={S.scroll} px="xl" pt="xl">
          <SectionWidgets widgets={widgets} section={activeTab} />
        </Box>
      </Tabs>
    </Paper>
  );
};

type CloseButtonProps = { onClose: () => void };

/** The panel's X, at the end of its tab bar. Shared with the segments panel. */
export const CloseButton = ({ onClose }: CloseButtonProps) => (
  <ActionIcon
    variant="subtle"
    aria-label={t`Close`}
    ml="auto"
    style={{ alignSelf: "center" }}
    onClick={onClose}
  >
    <Icon name="close" />
  </ActionIcon>
);

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
