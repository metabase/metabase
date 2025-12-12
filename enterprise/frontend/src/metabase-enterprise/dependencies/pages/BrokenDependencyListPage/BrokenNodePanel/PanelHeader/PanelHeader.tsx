import { t } from "ttag";

import { ActionIcon, FixedSizeIcon, Group, Title } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { getNodeLabel } from "../../../../utils";

type PanelHeaderProps = {
  node: DependencyNode;
  onClose: () => void;
};

export function PanelHeader({ node, onClose }: PanelHeaderProps) {
  return (
    <Group gap="0.75rem" wrap="nowrap">
      <Title order={3} lh="1.5rem" flex={1}>
        {getNodeLabel(node)}
      </Title>
      <ActionIcon aria-label={t`Close`} onClick={onClose}>
        <FixedSizeIcon name="close" />
      </ActionIcon>
    </Group>
  );
}
