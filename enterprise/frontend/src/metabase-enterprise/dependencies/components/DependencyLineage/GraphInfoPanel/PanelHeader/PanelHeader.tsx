import { Link } from "react-router";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import {
  ActionIcon,
  Box,
  Center,
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
  getNodeLocationInfo,
} from "../../utils";

import S from "./PanelHeader.module.css";

type PanelHeaderProps = {
  node: DependencyNode;
  onClose: () => void;
};

export function PanelHeader({ node, onClose }: PanelHeaderProps) {
  const link = getNodeLink(node);
  const location = getNodeLocationInfo(node);

  return (
    <Group className={S.root} p="lg" gap="0.75rem" wrap="nowrap" lh="1rem">
      <Center w="2.75rem" h="2.75rem" bdrs="50%" bg="bg-secondary">
        <FixedSizeIcon name={getNodeIcon(node)} c="brand" size={20} />
      </Center>
      <Box flex={1}>
        <Title order={3}>{getNodeLabel(node)}</Title>
        {location != null && (
          <Box
            className={S.link}
            component={Link}
            to={location.url}
            target="_blank"
            fz="sm"
          >
            {location.label}
          </Box>
        )}
      </Box>
      <Box m={rem(-ACTION_ICON_PADDING)}>
        {link != null && (
          <Tooltip label={link.tooltip}>
            <ActionIcon
              component={ForwardRefLink}
              to={link.url}
              target="_blank"
              aria-label={link.tooltip}
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
