import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { ActionIcon, FixedSizeIcon, Group, Title, Tooltip } from "metabase/ui";
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
      data-testid="dependency-list-sidebar-header"
    >
      <Title flex={1} order={3} lh="1.5rem">
        {getNodeLabel(node)}
      </Title>
      <Group gap="xs" wrap="nowrap">
        {link != null && (
          <Tooltip label={link.label} openDelay={TOOLTIP_OPEN_DELAY_MS}>
            <ActionIcon
              component={ForwardRefLink}
              to={link.url}
              target="_blank"
              aria-label={link.label}
            >
              <FixedSizeIcon name="external" />
            </ActionIcon>
          </Tooltip>
        )}
        <ActionIcon aria-label={t`Close`} onClick={onClose}>
          <FixedSizeIcon name="close" />
        </ActionIcon>
      </Group>
    </Group>
  );
}
