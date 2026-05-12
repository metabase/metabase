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
            const c = summary?.[tab.key];
            const total = c ? c.broken + c.stale + c.unreferenced : null;
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

      <StatStrip counts={counts} isLoading={summaryLoading} />

      {activeTab === "cards" && <CardsTab />}
      {activeTab === "dashboards" && <DashboardsTab />}
      {activeTab === "transforms" && <TransformsTab />}
    </Box>
  );
}
