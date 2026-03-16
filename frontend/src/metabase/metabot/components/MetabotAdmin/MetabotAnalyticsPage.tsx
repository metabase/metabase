import { useState } from "react";
import { t } from "ttag";

import { Box, SegmentedControl, Stack } from "metabase/ui";

import { MetabotConversationDetail } from "./MetabotConversationDetail";
import { MetabotConversationList } from "./MetabotConversationList";
import { MetabotConversationStats } from "./MetabotConversationStats";

type AnalyticsView =
  | { tab: "stats" }
  | { tab: "conversations"; filters?: Record<string, string> }
  | { tab: "detail"; conversationId: string };

export function MetabotAnalyticsPage() {
  const [view, setView] = useState<AnalyticsView>({ tab: "stats" });

  const activeTab = view.tab === "detail" ? "conversations" : view.tab;

  return (
    <Stack gap="lg" p="xl">
      <Box>
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
      </Box>

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
