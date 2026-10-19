import { t } from "ttag";

import { ActionIcon, Box, Group, Icon, Stack, Tabs } from "metabase/ui";
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

import {
  ANALYSIS_PANEL_TABS,
  type AnalysisPanelTab,
  useAnalysisDocument,
} from "./AnalysisDocumentContext";
import { useDocumentAnalysis } from "./use-document-analysis";

const SETTINGS_WIDTH = 400;
const PALETTE_WIDTH = 280;
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
  const isTabShown: Record<AnalysisPanelTab, boolean> = {
    setup: true,
    advanced: hasAdvanced,
    insights: hasInsights,
  };
  const tab = isTabShown[panelTab] ? panelTab : "setup";
  const isPaletteOpen = tab !== "insights";

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
      analysisDocument.setPanelTab(value);
    }
  };

  return (
    <SegmentDragProvider isPaletteOpen={isPaletteOpen}>
      <Group h="100%" gap={0} wrap="nowrap" align="stretch">
        <Stack
          w={SETTINGS_WIDTH}
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
            <Tabs value={tab} onChange={handleTabChange}>
              <Tabs.List style={{ borderBottom: "none" }}>
                <Tabs.Tab value="setup">{analysis.config.setupLabel}</Tabs.Tab>
                {hasAdvanced && (
                  <Tabs.Tab value="advanced">{t`Advanced`}</Tabs.Tab>
                )}
                {hasInsights && (
                  <Tabs.Tab value="insights">{t`Insights`}</Tabs.Tab>
                )}
              </Tabs.List>
            </Tabs>
            <ActionIcon
              variant="subtle"
              aria-label={t`Close`}
              style={{ alignSelf: "center" }}
              onClick={() => analysisDocument.setPanelTab(null)}
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
            {tab === "insights" ? (
              <InsightsPanel
                state={insights.state}
                action={insightAction}
                getExploreSeries={insights.getExploreSeries}
                transitionFilter={
                  analysisDocument.insightsTransition ?? undefined
                }
                onShowAll={() => analysisDocument.showInsights(nodeId)}
              />
            ) : (
              <SettingsList panel={tab} widgets={analysis.widgets} />
            )}
          </Box>
        </Stack>
        {isPaletteOpen && (
          <Box w={PALETTE_WIDTH} h="100%">
            <SegmentPalette
              table={analysis.table}
              usersTable={analysis.context.usersTable}
              headerHeight={HEADER_HEIGHT}
            />
          </Box>
        )}
      </Group>
    </SegmentDragProvider>
  );
};
