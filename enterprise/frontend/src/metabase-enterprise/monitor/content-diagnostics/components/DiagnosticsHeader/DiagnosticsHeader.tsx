import { memo } from "react";
import { c, t } from "ttag";

import {
  type PillTab,
  PillTabNavigation,
  getTabCount,
} from "metabase/common/components/PillTabNavigation";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { Group, Icon, Stack, Text, Tooltip, UnstyledButton } from "metabase/ui";
import * as Urls from "metabase/urls";
import { contentDiagnosticsApi } from "metabase-enterprise/api/content-diagnostics";

export const DiagnosticsHeader = memo(function DiagnosticsHeader() {
  const { currentData: counts, isError } =
    contentDiagnosticsApi.endpoints.getContentDiagnosticsCounts.useQueryState(
      undefined,
    );
  const tabs: PillTab[] = [
    {
      label: c("Navigation tab for content that hasn't been used recently")
        .t`Stale`,
      to: Urls.staleContent(),
      icon: "clock",
      count: getTabCount({ value: counts?.stale, isError }),
    },
    {
      label: c("Navigation tab for duplicated content").t`Duplicated`,
      to: Urls.duplicatedContent(),
      icon: "copy",
      count: getTabCount({ value: counts?.duplicated, isError }),
    },
    {
      label: c("Navigation tab for slow-loading content").t`Slow`,
      to: Urls.slowContent(),
      icon: "gauge",
      count: getTabCount({ value: counts?.slow, isError }),
    },
    {
      label: c(
        "Navigation tab for empty content, e.g. a collection with no items",
      ).t`Empty`,
      to: Urls.imbalancedContent("empty"),
      icon: "unreferenced",
      count: getTabCount({ value: counts?.empty, isError }),
    },
    {
      label: c("Navigation tab for content with very few items").t`Sparse`,
      to: Urls.imbalancedContent("sparse"),
      icon: "layout_grid",
      count: getTabCount({ value: counts?.sparse, isError }),
    },
    {
      label: c("Navigation tab for content with too many items").t`Crowded`,
      to: Urls.imbalancedContent("crowded"),
      icon: "grid_bordered",
      count: getTabCount({ value: counts?.crowded, isError }),
    },
  ];

  return (
    <Stack gap="xl">
      <MonitorHeaderTitle>{t`Content diagnostics`}</MonitorHeaderTitle>
      <Group justify="space-between" gap="md" wrap="nowrap">
        <PillTabNavigation tabs={tabs} />
        <DiagnosticsInfo />
      </Group>
    </Stack>
  );
});

function DiagnosticsInfo() {
  return (
    <Tooltip
      label={
        <Stack gap="sm">
          <Text c="inherit" fz="inherit" lh="inherit">
            {t`Content is scanned once a day at 4 AM server time to avoid slowing down your instance.`}
          </Text>
          <Text c="inherit" fz="inherit" lh="inherit">
            {t`Scans run in the background, so it can take a while before new findings show up.`}
          </Text>
          <Text c="inherit" fz="inherit" lh="inherit">
            {t`Dismiss a finding once you've fixed it. If the problem is still there, the finding will come back after the next scan.`}
          </Text>
        </Stack>
      }
      multiline
      maw="20rem"
      position="bottom-end"
    >
      <UnstyledButton
        aria-label={t`How content diagnostics works`}
        flex="none"
        style={{ lineHeight: 0 }}
      >
        <Icon name="info" c="text-secondary" />
      </UnstyledButton>
    </Tooltip>
  );
}
