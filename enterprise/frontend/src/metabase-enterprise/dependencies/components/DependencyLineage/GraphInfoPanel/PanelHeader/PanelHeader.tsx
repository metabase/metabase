import { t } from "ttag";

import { ActionIcon, FixedSizeIcon, Group, Title, rem } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { getNodeLabel } from "../../utils";

type PanelHeaderProps = {
  node: DependencyNode;
  onClose: () => void;
};

export function PanelHeader({ node, onClose }: PanelHeaderProps) {
  return (
    <Group p="lg" wrap="nowrap">
      <Title flex={1} order={5}>
        {getNodeLabel(node)}
      </Title>
      <ActionIcon m={rem(-6)} aria-label={t`Close`} onClick={onClose}>
        <FixedSizeIcon name="close" />
      </ActionIcon>
    </Group>
  );
}
