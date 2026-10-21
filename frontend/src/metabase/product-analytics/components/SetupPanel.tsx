import { type ReactNode, useState } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Divider,
  Group,
  Icon,
  Paper,
  Stack,
  Tabs,
  Text,
  Tooltip,
} from "metabase/ui";
import ChartSettingsWidget from "metabase/visualizations/components/ChartSettingsWidget";
import type { ConcreteTableId, Table } from "metabase-types/api";

import type { SettingWidget } from "../settings/types";
import type { AnalysisPanel } from "../use-analysis-state";

import { EventTablePicker } from "./EventTablePicker";
import { ResizeHandle } from "./ResizeHandle";
import S from "./SetupPanel.module.css";

// ChartSettingsWidget insets itself for the chart settings sidebar; the panel
// already provides padding here.
const WIDGET_STYLE = { marginInline: 0 };

const MIN_COLUMN_WIDTH = 240;
// The setup and segments columns together.
const MAX_TOTAL_WIDTH = 800;
const DEFAULT_MAIN_WIDTH = 400;
const DEFAULT_SEGMENTS_WIDTH = 272;

type SetupPanelProps = {
  tableId: ConcreteTableId | undefined;
  table: Table | undefined;
  /** Absent when the table is fixed, as it is for a saved analysis. */
  onTableChange?: (tableId: ConcreteTableId) => void;
  /** The tab that's showing. */
  tab: AnalysisPanel;
  onTabChange: (tab: AnalysisPanel) => void;
  setupLabel: string;
  widgets: SettingWidget[];
  isSegmentsOpen: boolean;
  onToggleSegments: () => void;
  /** The segments column, attached on the right while it's open. */
  segments: ReactNode;
  /** The toolbar button that closes this panel is hovered. */
  isHinted?: boolean;
};

/**
 * The panel on the left: the event table, then the analysis's settings in a
 * setup tab and an advanced one. The button beside the table shows the
 * segments in a column attached on the right. Until a table is picked, it's
 * only the table picker, opened.
 */
export const SetupPanel = ({
  tableId,
  table,
  onTableChange,
  tab,
  onTabChange,
  setupLabel,
  widgets,
  isSegmentsOpen,
  onToggleSegments,
  segments,
  isHinted = false,
}: SetupPanelProps) => {
  const [mainWidth, setMainWidth] = useState(DEFAULT_MAIN_WIDTH);
  const [segmentsWidth, setSegmentsWidth] = useState(DEFAULT_SEGMENTS_WIDTH);
  // Column role settings aren't shown, so some analyses have nothing here.
  const hasAdvanced = getSectionWidgets(widgets, "advanced").length > 0;
  const activeTab = hasAdvanced ? tab : "setup";
  const segmentsLabel = isSegmentsOpen ? t`Hide segments` : t`Show segments`;
  const isShowingSegments = tableId !== undefined && isSegmentsOpen;
  // Opening the segments may squeeze the setup to keep both under the cap.
  const shownMainWidth = Math.min(
    mainWidth,
    MAX_TOTAL_WIDTH - (isShowingSegments ? MIN_COLUMN_WIDTH : 0),
  );
  const shownSegmentsWidth = Math.min(
    segmentsWidth,
    MAX_TOTAL_WIDTH - shownMainWidth,
  );

  return (
    <Paper withBorder radius="md" className={S.root} data-hinted={isHinted}>
      <Stack className={S.main} w={shownMainWidth} gap={0}>
        <ResizeHandle
          className={S.mainHandle}
          getSize={() => shownMainWidth}
          min={MIN_COLUMN_WIDTH}
          max={MAX_TOTAL_WIDTH - (isShowingSegments ? shownSegmentsWidth : 0)}
          onResize={setMainWidth}
        />
        <Group gap="sm" wrap="nowrap" px="xl" pt="lg" pb="md">
          <Box flex={1} miw={0}>
            {onTableChange !== undefined ? (
              <EventTablePicker
                tableId={tableId}
                isInitiallyOpened={tableId === undefined}
                onChange={onTableChange}
                size="md"
                fullWidth
              />
            ) : (
              <Group gap="sm" wrap="nowrap">
                <Icon name="database" />
                <Text fw="bold" truncate>
                  {table?.display_name ?? t`Loading…`}
                </Text>
              </Group>
            )}
          </Box>
          <Tooltip label={segmentsLabel}>
            <ActionIcon
              variant="default"
              size="lg"
              className={S.segmentsToggle}
              aria-label={segmentsLabel}
              aria-pressed={isSegmentsOpen}
              disabled={tableId === undefined}
              onClick={onToggleSegments}
            >
              <Icon name="segment" />
            </ActionIcon>
          </Tooltip>
        </Group>
        {tableId !== undefined && (
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
        )}
      </Stack>
      {isShowingSegments && (
        <Box className={S.segments} w={shownSegmentsWidth}>
          {segments}
          <ResizeHandle
            className={S.segmentsHandle}
            getSize={() => shownSegmentsWidth}
            min={MIN_COLUMN_WIDTH}
            max={MAX_TOTAL_WIDTH - shownMainWidth}
            onResize={setSegmentsWidth}
          />
        </Box>
      )}
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
