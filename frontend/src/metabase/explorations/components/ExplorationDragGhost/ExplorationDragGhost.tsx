import { t } from "ttag";

import type { ExplorationDragData } from "metabase/explorations/hooks";
import { Group, Icon, Paper, Text } from "metabase/ui";

import S from "./ExplorationDragGhost.module.css";

export interface ExplorationDragGhostProps {
  data: ExplorationDragData;
}

/**
 * Floating preview rendered by the page-level `<DragOverlay>` while a
 * Browse-picker row is being dragged. The original row is dimmed in
 * place (see `ItemList.module.css` → `.metricItemDragging`); this
 * component is what the cursor actually carries.
 *
 * Kept deliberately small — a pill with an entity-kind icon, the name
 * and a "metric"/"dimension" badge — so it doesn't obscure the drop
 * targets it's being aimed at.
 */
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
