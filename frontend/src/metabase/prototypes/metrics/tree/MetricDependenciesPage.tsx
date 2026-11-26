import type { ReactNode } from "react";

import { PillTabNavigation } from "metabase/common/components/PillTabNavigation";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import {
  PaneHeader,
  PanelHeaderTitle,
} from "metabase/common/data-studio/components/PaneHeader";
import {
  ActionIcon,
  Box,
  Breadcrumbs,
  Card,
  Group,
  Icon,
  Stack,
  Text,
} from "metabase/ui";

import { ExamplesBar, useExampleParam } from "../explorer/ExamplesBar";
import type { MetricExample } from "../explorer/examples";

const TABS = ["About", "Overview", "Definition", "Dimensions", "Dependencies"];

/**
 * The editor's examples bar above a metric's page, as in "Metric Explorer as
 * editor", opened on its Dependencies tab. The tab's content is the tree.
 */
export function MetricDependenciesPage({
  children,
}: {
  children: (example: MetricExample, select: (id: string) => void) => ReactNode;
}) {
  const { example, select } = useExampleParam();

  return (
    <Stack gap="sm">
      <ExamplesBar activeId={example.id} onSelect={select} />
      <Box
        bd="1px solid var(--mb-color-border-neutral)"
        style={{ borderRadius: 8, overflow: "hidden" }}
      >
        <PageContainer pt="md" h="auto">
          <PaneHeader
            icon="metric"
            breadcrumbs={
              <Breadcrumbs
                separator={<Icon size={12} name="chevronright" />}
                fz="sm"
                c="text-secondary"
              >
                <Text size="sm" c="inherit">
                  Our analytics
                </Text>
              </Breadcrumbs>
            }
            title={<PanelHeaderTitle>{example.name}</PanelHeaderTitle>}
            tabs={
              <PillTabNavigation
                tabs={TABS.map((label) => ({
                  label,
                  onClick: () => undefined,
                  isSelected: label === "Dependencies",
                }))}
              />
            }
            menu={
              <Group gap="xs" wrap="nowrap">
                <ActionIcon variant="subtle" c="text-secondary">
                  <Icon name="bookmark" />
                </ActionIcon>
                <ActionIcon variant="subtle" c="text-secondary">
                  <Icon name="ellipsis" />
                </ActionIcon>
              </Group>
            }
          />
          <Card withBorder shadow="none" p={0} h={680}>
            {children(example, select)}
          </Card>
        </PageContainer>
      </Box>
    </Stack>
  );
}
