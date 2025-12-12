import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import {
  ActionIcon,
  FixedSizeIcon,
  Group,
  Title,
  Tooltip,
  rem,
} from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { ACTION_ICON_PADDING, TOOLTIP_OPEN_DELAY } from "../../../../constants";
import { getNodeLabel, getNodeLink } from "../../../../utils";

type PanelHeaderProps = {
  node: DependencyNode;
  onClose: () => void;
};

export function PanelHeader({ node, onClose }: PanelHeaderProps) {
  const link = getNodeLink(node);

  return (
    <Group gap="0.75rem" wrap="nowrap">
      <Title order={3} lh="1.5rem">
        {getNodeLabel(node)}
      </Title>
      <Group gap="xs" wrap="nowrap" m={rem(-ACTION_ICON_PADDING)}>
        {link != null && (
          <Tooltip label={link.label} openDelay={TOOLTIP_OPEN_DELAY}>
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
