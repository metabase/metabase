import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import {
  ActionIcon,
  Box,
  FixedSizeIcon,
  Group,
  Title,
  Tooltip,
  rem,
} from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { ACTION_ICON_PADDING } from "../../constants";
import {
  getNodeIcon,
  getNodeLabel,
  getNodeLink,
  getNodeLinkTooltip,
} from "../../utils";

type PanelHeaderProps = {
  node: DependencyNode;
  onClose: () => void;
};

export function PanelHeader({ node, onClose }: PanelHeaderProps) {
  const link = getNodeLink(node);
  const tooltip = getNodeLinkTooltip(node);

  return (
    <Group p="lg" gap="sm" wrap="nowrap">
      <FixedSizeIcon c="brand" name={getNodeIcon(node)} />
      <Title flex={1} order={5}>
        {getNodeLabel(node)}
      </Title>
      <Box m={rem(-ACTION_ICON_PADDING)}>
        {link != null && (
          <Tooltip label={tooltip}>
            <ActionIcon
              component={ForwardRefLink}
              to={link}
              target="_blank"
              aria-label={tooltip}
            >
              <FixedSizeIcon name="external" />
            </ActionIcon>
          </Tooltip>
        )}
        <ActionIcon aria-label={t`Close`} onClick={onClose}>
          <FixedSizeIcon name="close" />
        </ActionIcon>
      </Box>
    </Group>
  );
}
