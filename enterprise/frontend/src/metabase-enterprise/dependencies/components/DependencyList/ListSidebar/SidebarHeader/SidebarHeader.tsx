import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import * as Urls from "metabase/lib/urls";
import { ActionIcon, Anchor, FixedSizeIcon, Group, Tooltip } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { TOOLTIP_OPEN_DELAY_MS } from "../../../../constants";
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
      <Group gap={0}>
        <Tooltip
          label={t`Open in dependency graph`}
          openDelay={TOOLTIP_OPEN_DELAY_MS}
        >
          <ActionIcon
            component={ForwardRefLink}
            to={Urls.dependencyGraph({ entry: node })}
            aria-label={t`Open in dependency graph`}
            onClick={onClose}
          >
            <FixedSizeIcon name="dependencies" />
          </ActionIcon>
        </Tooltip>
        <ActionIcon aria-label={t`Close`} onClick={onClose}>
          <FixedSizeIcon name="close" />
        </ActionIcon>
      </Group>
    </Group>
  );
}
