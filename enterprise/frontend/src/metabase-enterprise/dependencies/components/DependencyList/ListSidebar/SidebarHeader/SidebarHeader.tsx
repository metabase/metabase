import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { ActionIcon, Anchor, FixedSizeIcon, Group } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { getNodeLabel, getNodeLink } from "../../../../utils";

type SidebarHeaderProps = {
  node: DependencyNode;
  onClose: () => void;
};

export function SidebarHeader({ node, onClose }: SidebarHeaderProps) {
  const link = getNodeLink(node);

  return (
    <Group
      gap="0.75rem"
      wrap="nowrap"
      align="start"
      justify="space-between"
      data-testid="dependency-list-sidebar-header"
    >
      <Anchor
        component={ForwardRefLink}
        fz="h3"
        fw="bold"
        lh="1.5rem"
        to={link?.url ?? ""}
        target="_blank"
      >
        {getNodeLabel(node)}
      </Anchor>
      <ActionIcon aria-label={t`Close`} onClick={onClose}>
        <FixedSizeIcon name="close" />
      </ActionIcon>
    </Group>
  );
}
