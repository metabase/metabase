import { t } from "ttag";

import { ActionIcon, Box, Group, Icon, Stack, Tabs } from "metabase/ui";
import type { ProductAnalyticsNodeDefinition } from "metabase-types/api";

import { isOneOf } from "../analyses/setting-helpers";
import { type InsightAction, InsightsPanel } from "../components/InsightsPanel";
import { SettingsList, hasPanelSettings } from "../components/SettingsPanel";
import { getInsightBreakdownSettings } from "../insights/breakdown-settings";
import { useFunnelInsights } from "../insights/use-funnel-insights";

import {
  ANALYSIS_PANEL_TABS,
  type AnalysisPanelTab,
  useAnalysisDocument,
} from "./AnalysisDocumentContext";
import { useDocumentAnalysis } from "./use-document-analysis";

type AnalysisSidePanelProps = {
  nodeId: string;
  definition: ProductAnalyticsNodeDefinition;
  panelTab: AnalysisPanelTab;
};

/** Settings and insights for the analysis in edit mode, one tab at a time. */
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

  const insights = useFunnelInsights({
    spec: analysis.spec,
    tableId: analysisDocument.tableId,
    base: analysis.base,
    context: analysis.context,
    isEnabled: tab === "insights",
  });
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
          ...getInsightBreakdownSettings(insight, insights.state.attributes),
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
    <Stack h="100%" gap={0} aria-label={t`Analysis settings`}>
      <Group
        justify="space-between"
        wrap="nowrap"
        px="lg"
        pt="md"
        style={{ borderBottom: "1px solid var(--mb-color-border)" }}
      >
        <Tabs value={tab} onChange={handleTabChange}>
          <Tabs.List style={{ borderBottom: "none" }}>
            <Tabs.Tab value="setup">{analysis.config.setupLabel}</Tabs.Tab>
            {hasAdvanced && <Tabs.Tab value="advanced">{t`Advanced`}</Tabs.Tab>}
            {hasInsights && <Tabs.Tab value="insights">{t`Insights`}</Tabs.Tab>}
          </Tabs.List>
        </Tabs>
        <ActionIcon
          variant="subtle"
          aria-label={t`Close`}
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
          <InsightsPanel state={insights.state} action={insightAction} />
        ) : (
          <SettingsList panel={tab} widgets={analysis.widgets} />
        )}
      </Box>
    </Stack>
  );
};
