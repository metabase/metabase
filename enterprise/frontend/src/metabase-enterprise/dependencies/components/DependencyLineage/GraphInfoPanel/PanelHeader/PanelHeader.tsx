import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import {
  ActionIcon,
  Box,
  Center,
  FixedSizeIcon,
  Group,
  Stack,
  Title,
  Tooltip,
  rem,
} from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { GraphNodeLocation } from "../../GraphNodeLocation";
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
      <Stack gap="xs" flex={1}>
        <Title order={3}>{getNodeLabel(node)}</Title>
        {location != null && <GraphNodeLocation location={location} />}
      </Stack>
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
