import { Link } from "react-router";
import { t } from "ttag";

import { ActionIcon, Box, FixedSizeIcon, Group, Title, rem } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { ACTION_ICON_PADDING } from "../../constants";
import { getNodeIcon, getNodeLabel, getNodeLink } from "../../utils";

type PanelHeaderProps = {
  node: DependencyNode;
  onClose: () => void;
};

export function PanelHeader({ node, onClose }: PanelHeaderProps) {
  const link = getNodeLink(node);

  return (
    <Group p="lg" gap="sm" wrap="nowrap">
      <FixedSizeIcon c="brand" name={getNodeIcon(node)} />
      <Title flex={1} order={5}>
        {getNodeLabel(node)}
      </Title>
      <Box m={rem(-ACTION_ICON_PADDING)}>
        {link != null && (
          <ActionIcon
            component={Link}
            to={link}
            target="_blank"
            aria-label={t`Open in a new tab`}
          >
            <FixedSizeIcon name="external" />
          </ActionIcon>
        )}
        <ActionIcon aria-label={t`Close`} onClick={onClose}>
          <FixedSizeIcon name="close" />
        </ActionIcon>
      </Box>
    </Group>
  );
}
