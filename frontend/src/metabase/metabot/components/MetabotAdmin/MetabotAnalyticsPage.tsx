import { useState } from "react";
import { t } from "ttag";

import { Box, Flex, SegmentedControl, Select, Stack } from "metabase/ui";

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
      <Flex justify="space-between" align="center">
        <SegmentedControl
          value={activeTab}
          onChange={(value) => {
            if (value === "stats") {
              setView({ tab: "stats" });
            } else {
              setView({ tab: "conversations" });
            }
          }}
          data={[
            { value: "stats", label: t`Conversation Stats` },
            { value: "conversations", label: t`Conversations` },
          ]}
        />
        <Select
          value={timeRange}
          onChange={(value) => value && setTimeRange(value)}
          data={TIME_RANGE_OPTIONS}
          w={180}
        />
      </Flex>

      {view.tab === "stats" && (
        <MetabotConversationStats
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
