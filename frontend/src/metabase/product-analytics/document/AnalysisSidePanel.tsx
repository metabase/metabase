import { useState } from "react";
import { t } from "ttag";

import { useLazyGetTableQuery } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { SidePanelResizeHandle } from "metabase/documents/components/SidePanelResizeHandle";
import { useSidePanelWidths } from "metabase/documents/hooks/use-side-panel-widths";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Icon,
  Stack,
  Tabs,
  Text,
  Tooltip,
} from "metabase/ui";
import type {
  ConcreteTableId,
  ProductAnalyticsNodeDefinition,
} from "metabase-types/api";

import { isOneOf } from "../analyses/setting-helpers";
import { EventTablePicker } from "../components/EventTablePicker";
import { type InsightAction, InsightsPanel } from "../components/InsightsPanel";
import { SettingsList, hasPanelSettings } from "../components/SettingsPanel";
import { SegmentPalette } from "../components/palette/SegmentPalette";
import { getInsightBreakdownSettings } from "../insights/breakdown-settings";
import { isFirstEventInsight } from "../insights/first-events";
import { getInsightPathsSettings } from "../insights/paths-settings";
import type { Insight } from "../insights/types";
import { useFunnelInsights } from "../insights/use-funnel-insights";
import { SegmentDragProvider } from "../segments/drag-context";
import type { SegmentSource } from "../segments/types";
import { usePrototypeTable } from "../use-prototype-table";

import {
  ANALYSIS_PANEL_TABS,
  type AnalysisPanelTab,
  useAnalysisDocument,
} from "./AnalysisDocumentContext";
import S from "./AnalysisSidePanel.module.css";
import { updateAnalysisNodeTable } from "./analysis-node-utils";
import { useDocumentAnalysis } from "./use-document-analysis";

const INSIGHTS_WIDTH = 400;
/** A medium button's height, so the segments toggle matches the table picker. */
const TABLE_PICKER_HEIGHT = 32;
/** Shared by the table picker row and the segments title so the tabs line up. */
const TITLE_ROW_HEIGHT = "4rem";
/** Shared by the settings and palette headers so their borders line up. */
const HEADER_HEIGHT = "3.25rem";

type AnalysisSidePanelProps = {
  nodeId: string;
  definition: ProductAnalyticsNodeDefinition;
  panelTab: AnalysisPanelTab;
};

/**
 * Settings and insights for the analysis in edit mode, one tab at a time.
 * Beside the settings, the segment palette, whose segments drag onto them.
 */
export const AnalysisSidePanel = ({
  nodeId,
  definition,
  panelTab,
}: AnalysisSidePanelProps) => {
  const analysisDocument = useAnalysisDocument();
  const prototype = usePrototypeTable();
  const [fetchTable] = useLazyGetTableQuery();
  const [sendToast] = useToast();
  const analysis = useDocumentAnalysis({ nodeId, definition, isEnabled: true });
  const hasInsights = definition.kind === "funnel";
  const hasAdvanced = hasPanelSettings(analysis.widgets, "advanced");
  const hasFilters = hasPanelSettings(analysis.widgets, "filters");
  const isTabShown: Record<AnalysisPanelTab, boolean> = {
    setup: true,
    advanced: hasAdvanced,
    filters: hasFilters,
    insights: hasInsights,
  };
  const tab = isTabShown[panelTab] ? panelTab : "setup";
  const [isPaletteToggledOpen, setIsPaletteToggledOpen] =
    useState(readIsPaletteOpen);
  const togglePalette = () => {
    const isOpen = !isPaletteToggledOpen;
    setIsPaletteToggledOpen(isOpen);
    writeIsPaletteOpen(isOpen);
  };
  const isPaletteOpen = tab !== "insights" && isPaletteToggledOpen;
  const { widths, activeHandle, startResize } = useSidePanelWidths({
    storageKey: "metabase.product-analytics.side-panel-widths",
    isPaletteOpen,
  });
  // Each settings tab opens the segments it works with; a pick made while on
  // a tab sticks until the settings tab changes.
  const [pickedSegmentTab, setPickedSegmentTab] = useState<{
    settingsTab: AnalysisPanelTab;
    segmentTab: SegmentSource;
  } | null>(null);
  const segmentTab =
    pickedSegmentTab?.settingsTab === tab
      ? pickedSegmentTab.segmentTab
      : getDefaultSegmentTab(tab);

  const insights = useFunnelInsights({
    spec: analysis.spec,
    tableId: analysis.tableId,
    base: analysis.base,
    context: analysis.context,
    isEnabled: tab === "insights",
  });
  const funnelSteps =
    "funnel.steps" in analysis.computed
      ? analysis.computed["funnel.steps"]
      : [];
  const getInsightSettings = (
    insight: Insight,
    state: Extract<typeof insights.state, { status: "done" }>,
  ) =>
    isFirstEventInsight(insight)
      ? getInsightPathsSettings(insight, funnelSteps)
      : getInsightBreakdownSettings(insight, state.attributes);
  const insightAction: InsightAction = {
    label: t`Add to document`,
    icon: "add",
    onClick: (insight) => {
      if (insights.state.status !== "done") {
        return;
      }
      analysisDocument.insertAnalysisBelow(nodeId, {
        ...definition,
        settings: {
          ...definition.settings,
          ...getInsightSettings(insight, insights.state),
        },
      });
    },
  };

  const handleTabChange = (value: string | null) => {
    if (isOneOf(ANALYSIS_PANEL_TABS, value)) {
      setPickedSegmentTab(null);
      analysisDocument.setPanelTab(value);
    }
  };

  const closePanel = () => analysisDocument.setPanelTab(null);

  // Prototype: the generated SQL is ClickHouse-only, as on the analysis page.
  const handleTableChange = async (id: ConcreteTableId) => {
    const { data: table } = await fetchTable({ id }, true);
    const { editor } = analysisDocument;
    if (table && prototype.clickHouseDatabaseIds.includes(table.db_id)) {
      if (editor !== null) {
        updateAnalysisNodeTable(editor, nodeId, id);
      }
    } else {
      sendToast({
        icon: "warning",
        message: t`For now, only tables in ClickHouse databases can be analyzed.`,
      });
    }
  };

  if (tab === "insights") {
    return (
      <Stack
        className={S.dockedPanel}
        w={INSIGHTS_WIDTH}
        gap={0}
        aria-label={t`Insights`}
      >
        <Group
          h={HEADER_HEIGHT}
          justify="space-between"
          wrap="nowrap"
          px="lg"
          style={{
            flexShrink: 0,
            borderBottom: "1px solid var(--mb-color-border)",
          }}
        >
          <Text fw="bold">{t`Insights`}</Text>
          <ActionIcon
            variant="subtle"
            aria-label={t`Close`}
            onClick={closePanel}
          >
            <Icon name="close" />
          </ActionIcon>
        </Group>
        <Box
          flex={1}
          mih={0}
          px="xl"
          pt="xl"
          pb="lg"
          style={{ overflowY: "auto" }}
        >
          <InsightsPanel
            state={insights.state}
            action={insightAction}
            getExploreSeries={insights.getExploreSeries}
            transitionFilter={analysisDocument.insightsTransition ?? undefined}
            onShowAll={() => analysisDocument.showInsights(nodeId)}
          />
        </Box>
      </Stack>
    );
  }

  return (
    <SegmentDragProvider isPaletteOpen={isPaletteOpen}>
      <Box className={S.floatingPanels}>
        <Box className={S.resizableCard}>
          <SidePanelResizeHandle
            handle="outer"
            isActive={activeHandle === "outer"}
            onPointerDown={(event) => startResize("outer", event)}
          />
          <Group
            className={S.floatingCard}
            gap={0}
            wrap="nowrap"
            align="stretch"
          >
            <Stack
              w={widths.settings}
              h="100%"
              gap={0}
              aria-label={t`Analysis settings`}
            >
              <Group
                h={TITLE_ROW_HEIGHT}
                px="lg"
                gap="sm"
                align="flex-end"
                wrap="nowrap"
                style={{ flexShrink: 0 }}
              >
                <Box flex={1} miw={0}>
                  <EventTablePicker
                    tableId={analysis.tableId}
                    isLoading={false}
                    fullWidth
                    onChange={handleTableChange}
                  />
                </Box>
                <Tooltip
                  label={isPaletteOpen ? t`Hide segments` : t`Show segments`}
                >
                  <ActionIcon
                    className={S.pickerRowButton}
                    size={TABLE_PICKER_HEIGHT}
                    c={isPaletteOpen ? "brand" : "text-secondary"}
                    aria-label={t`Segments`}
                    aria-pressed={isPaletteOpen}
                    onClick={togglePalette}
                  >
                    <Icon name="segment" />
                  </ActionIcon>
                </Tooltip>
              </Group>
              <Group
                h={HEADER_HEIGHT}
                justify="space-between"
                align="flex-end"
                wrap="nowrap"
                px="lg"
                style={{
                  flexShrink: 0,
                  borderBottom: "1px solid var(--mb-color-border)",
                }}
              >
                <Tabs
                  className={S.tabs}
                  value={tab}
                  listBorder={false}
                  miw={0}
                  onChange={handleTabChange}
                >
                  <Tabs.List className={S.tabList}>
                    <Tabs.Tab value="setup">
                      {analysis.config.setupLabel}
                    </Tabs.Tab>
                    {hasAdvanced && (
                      <Tabs.Tab value="advanced">{t`Advanced`}</Tabs.Tab>
                    )}
                    {hasFilters && (
                      <Tabs.Tab value="filters">{t`Filters`}</Tabs.Tab>
                    )}
                  </Tabs.List>
                </Tabs>
              </Group>
              <Box
                flex={1}
                mih={0}
                px="xl"
                pt="xl"
                pb="lg"
                style={{ overflowY: "auto" }}
              >
                <SettingsList panel={tab} widgets={analysis.widgets} />
              </Box>
              <Box px="xl" pt="md" pb="lg" style={{ flexShrink: 0 }}>
                <Button
                  variant="filled"
                  fullWidth
                  onClick={analysisDocument.stopEditing}
                >
                  {t`Done`}
                </Button>
              </Box>
            </Stack>
            {isPaletteOpen && (
              <SidePanelResizeHandle
                handle="divider"
                isActive={activeHandle === "divider"}
                onPointerDown={(event) => startResize("divider", event)}
              />
            )}
            {isPaletteOpen && (
              <Box w={widths.palette} h="100%">
                <SegmentPalette
                  table={analysis.table}
                  usersTable={analysis.context.usersTable}
                  titleRowHeight={TITLE_ROW_HEIGHT}
                  titleRowControlHeight={TABLE_PICKER_HEIGHT}
                  headerHeight={HEADER_HEIGHT}
                  activeTab={segmentTab}
                  onTabChange={(segmentTab) =>
                    setPickedSegmentTab({ settingsTab: tab, segmentTab })
                  }
                />
              </Box>
            )}
          </Group>
        </Box>
      </Box>
    </SegmentDragProvider>
  );
};

// Showing or hiding the segments sticks for the rest of the session.
const PALETTE_OPEN_STORAGE_KEY = "metabase.product-analytics.segments-open";

const readIsPaletteOpen = (): boolean => {
  try {
    return window.sessionStorage.getItem(PALETTE_OPEN_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
};

const writeIsPaletteOpen = (isOpen: boolean) => {
  try {
    window.sessionStorage.setItem(PALETTE_OPEN_STORAGE_KEY, String(isOpen));
  } catch {
    // The choice just won't be remembered.
  }
};

const getDefaultSegmentTab = (tab: AnalysisPanelTab): SegmentSource =>
  tab === "filters" ? "people" : "event";
