import { useState } from "react";
import { t } from "ttag";
import { noop } from "underscore";

import {
  Badge,
  Box,
  Button,
  Code,
  Flex,
  Group,
  Stack,
  Text,
} from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";

import type { PanelSeries } from "./types";

const PANEL_HEIGHT = 380;

type VizPanelProps = {
  title: string;
  series: PanelSeries | undefined;
  status?: string;
  badges?: string[];
  children?: React.ReactNode;
};

export function VizPanel({
  title,
  series,
  status,
  badges = [],
  children,
}: VizPanelProps) {
  const [showSettings, setShowSettings] = useState(false);
  const settings = series?.card.visualization_settings ?? {};

  return (
    <Stack gap="xs" p="sm" bd="1px solid var(--mb-color-border)" bdrs="md">
      <Group justify="space-between">
        <Text fw="bold">{title}</Text>
        <Group gap="xs">
          {series && <Badge variant="filled">{series.card.display}</Badge>}
          {badges.map((badge) => (
            <Badge key={badge} variant="outline">
              {badge}
            </Badge>
          ))}
        </Group>
      </Group>
      <Box h={PANEL_HEIGHT} pos="relative">
        {series ? (
          <Visualization
            rawSeries={[series]}
            isQueryBuilder={false}
            onChangeCardAndRun={noop}
          />
        ) : (
          <Flex h="100%" align="center" justify="center">
            <Text c="text-secondary">{status ?? t`Loading…`}</Text>
          </Flex>
        )}
      </Box>
      {children}
      <Button
        size="compact-xs"
        variant="subtle"
        onClick={() => setShowSettings((value) => !value)}
      >
        {showSettings ? t`Hide settings` : t`Show settings`}
      </Button>
      {showSettings && (
        <Code block style={{ maxHeight: 240, overflow: "auto" }}>
          {JSON.stringify(settings, null, 2)}
        </Code>
      )}
    </Stack>
  );
}
