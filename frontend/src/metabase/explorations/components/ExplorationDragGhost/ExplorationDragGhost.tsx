import { t } from "ttag";

import type { ExplorationDragData } from "metabase/explorations/hooks";
import { Group, Icon, Paper, Text } from "metabase/ui";

import S from "./ExplorationDragGhost.module.css";

export interface ExplorationDragGhostProps {
  data: ExplorationDragData;
}

export function ExplorationDragGhost({ data }: ExplorationDragGhostProps) {
  if (data.kind === "metric") {
    return (
      <Paper className={S.ghost} bd="1px solid border" shadow="md" radius="md">
        <Group gap="sm" wrap="nowrap" align="center" px="md" py="sm">
          <Icon name="metric" size={14} c="brand" />
          <Text fw="bold" size="sm" lh="1.25" lineClamp={1}>
            {data.payload.name}
          </Text>
          <Text className={S.kindBadge} component="span">
            {t`metric`}
          </Text>
        </Group>
      </Paper>
    );
  }

  if (data.kind === "timeline") {
    return (
      <Paper className={S.ghost} bd="1px solid border" shadow="md" radius="md">
        <Group gap="sm" wrap="nowrap" align="center" px="md" py="sm">
          <Icon name="calendar" size={14} c="brand" />
          <Text fw="bold" size="sm" lh="1.25" lineClamp={1}>
            {data.payload.name}
          </Text>
          <Text className={S.kindBadge} component="span">
            {t`timeline`}
          </Text>
        </Group>
      </Paper>
    );
  }

  return (
    <Paper className={S.ghost} bd="1px solid border" shadow="md" radius="md">
      <Group gap="sm" wrap="nowrap" align="center" px="md" py="sm">
        <Icon name="label" size={14} c="brand" />
        <Text fw="bold" size="sm" lh="1.25" lineClamp={1}>
          {data.payload.display_name ?? data.payload.id}
        </Text>
        <Text className={S.kindBadge} component="span">
          {t`dimension`}
        </Text>
      </Group>
    </Paper>
  );
}
