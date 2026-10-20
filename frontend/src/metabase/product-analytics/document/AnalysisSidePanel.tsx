import { useState } from "react";
import { t } from "ttag";

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
import type { ProductAnalyticsNodeDefinition } from "metabase-types/api";

import { isOneOf } from "../analyses/setting-helpers";
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

import {
  ANALYSIS_PANEL_TABS,
  type AnalysisPanelTab,
  useAnalysisDocument,
} from "./AnalysisDocumentContext";
import S from "./AnalysisSidePanel.module.css";
import { useDocumentAnalysis } from "./use-document-analysis";

const INSIGHTS_WIDTH = 400;
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
    tableId: analysisDocument.tableId,
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
                <Group gap="xs" wrap="nowrap" style={{ alignSelf: "center" }}>
                  <Tooltip
                    label={isPaletteOpen ? t`Hide segments` : t`Show segments`}
                  >
                    <ActionIcon
                      variant="subtle"
                      c={isPaletteOpen ? "brand" : "text-secondary"}
                      aria-label={t`Segments`}
                      aria-pressed={isPaletteOpen}
                      onClick={togglePalette}
                    >
                      <Icon name="segment" />
                    </ActionIcon>
                  </Tooltip>
                </Group>
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
