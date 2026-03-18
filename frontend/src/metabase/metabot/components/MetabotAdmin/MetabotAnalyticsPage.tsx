import { useState } from "react";
import { t } from "ttag";

import { Stack, Tabs } from "metabase/ui";

import { MetabotConversationDetail } from "./MetabotConversationDetail";
import { MetabotConversationList } from "./MetabotConversationList";
import { MetabotConversationStats } from "./MetabotConversationStats";

export const TIME_RANGE_OPTIONS = [
  { value: "today", label: t`Today` },
  { value: "yesterday", label: t`Yesterday` },
  { value: "7d", label: t`Past 7 days` },
  { value: "30d", label: t`Past 30 days` },
  { value: "60d", label: t`Past 60 days` },
  { value: "90d", label: t`Past 90 days` },
  { value: "custom", label: t`Custom` },
];

type AnalyticsView =
  | { tab: "stats" }
  | { tab: "conversations"; filters?: Record<string, string> }
  | { tab: "detail"; conversationId: string };

export function MetabotAnalyticsPage() {
  const [view, setView] = useState<AnalyticsView>({ tab: "stats" });
  const [timeRange, setTimeRange] = useState("30d");

  const activeTab = view.tab === "detail" ? "conversations" : view.tab;

  return (
    <Stack gap="lg" p="xl">
      <Tabs
        value={activeTab}
        onChange={(value) => {
          if (value === "stats") {
            setView({ tab: "stats" });
          } else {
            setView({ tab: "conversations" });
          }
        }}
      >
        <Tabs.List>
          <Tabs.Tab value="stats">{t`Conversation Stats`}</Tabs.Tab>
          <Tabs.Tab value="conversations">{t`Conversations`}</Tabs.Tab>
        </Tabs.List>
      </Tabs>

      {view.tab === "stats" && (
        <MetabotConversationStats
          timeRange={timeRange}
          onTimeRangeChange={(value) => value && setTimeRange(value)}
          onDrillDown={(filters) =>
            setView({ tab: "conversations", filters })
          }
        />
      )}
      {view.tab === "conversations" && (
        <MetabotConversationList
          filters={view.filters}
          onSelectConversation={(id) =>
            setView({ tab: "detail", conversationId: id })
          }
        />
      )}
      {view.tab === "detail" && (
        <MetabotConversationDetail
          conversationId={view.conversationId}
          onBack={() => setView({ tab: "conversations" })}
        />
      )}
    </Stack>
  );
}
