import { useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { Anchor, Box, Group, Stack, Tabs, Text, Title } from "metabase/ui";

import { useGetIntrospectorSummaryQuery } from "./api";
import { StatStrip } from "./components/StatStrip";
import { CardsTab } from "./tabs/CardsTab";
import { DashboardsTab } from "./tabs/DashboardsTab";
import { TransformsTab } from "./tabs/TransformsTab";
import type { IntrospectorEntityType } from "./types";

const TABS: { key: IntrospectorEntityType; label: string }[] = [
  { key: "cards", label: "Cards" },
  { key: "dashboards", label: "Dashboards" },
  { key: "transforms", label: "Transforms" },
];

// For transforms, `stale` and `unreferenced` are the same wire value
// (see StatStrip + queries.clj :summary) so we'd double-count if we summed all three.
function tabTotal(
  key: IntrospectorEntityType,
  counts: { broken: number; stale: number; unreferenced: number } | undefined,
): number | null {
  if (!counts) {
    return null;
  }
  if (key === "transforms") {
    return counts.broken + counts.stale;
  }
  return counts.broken + counts.stale + counts.unreferenced;
}

export function IntrospectorPage() {
  const [activeTab, setActiveTab] = useState<IntrospectorEntityType>("cards");
  const { data: summary, isFetching: summaryLoading } =
    useGetIntrospectorSummaryQuery();

  const counts = summary?.[activeTab];

  return (
    <Box p="lg" style={{ maxWidth: 1200, margin: "0 auto" }}>
      <Stack gap="sm" mb="lg">
        <Title order={2}>{t`Introspector`}</Title>
        <Text c="text-secondary" size="sm">
          {t`Find stale, broken, and unreferenced content across your instance.`}
        </Text>
        <Group gap="md">
          <Anchor component={Link} to="/admin/introspector" fw={600}>
            {t`Content`}
          </Anchor>
          <Anchor
            component={Link}
            to="/admin/introspector/workload"
            c="text-secondary"
          >
            {t`Workload`}
          </Anchor>
        </Group>
      </Stack>

      <Tabs
        value={activeTab}
        onChange={(v) => v && setActiveTab(v as IntrospectorEntityType)}
        mb="md"
      >
        <Tabs.List>
          {TABS.map((tab) => {
            const total = tabTotal(tab.key, summary?.[tab.key]);
            return (
              <Tabs.Tab key={tab.key} value={tab.key}>
                {tab.label}
                {total != null ? (
                  <Text component="span" ml={6} c="text-secondary" size="xs">
                    {total}
                  </Text>
                ) : null}
              </Tabs.Tab>
            );
          })}
        </Tabs.List>
      </Tabs>

      <StatStrip
        counts={counts}
        isLoading={summaryLoading}
        entityType={activeTab}
      />

      {activeTab === "cards" && <CardsTab />}
      {activeTab === "dashboards" && <DashboardsTab />}
      {activeTab === "transforms" && <TransformsTab />}
    </Box>
  );
}
