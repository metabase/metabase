import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import {
  ActionIcon,
  Center,
  FixedSizeIcon,
  Group,
  Stack,
  Title,
} from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import {
  getNodeIcon,
  getNodeLabel,
  getNodeLink,
  getNodeLocationInfo,
} from "../../../../utils";
import { GraphBreadcrumbs } from "../../GraphBreadcrumbs";
import { GraphExternalLink } from "../../GraphExternalLink";

import S from "./PanelHeader.module.css";

type PanelHeaderProps = {
  node: DependencyNode;
  onClose: () => void;
};

export function PanelHeader({ node, onClose }: PanelHeaderProps) {
  const link = getNodeLink(node);
  const location = getNodeLocationInfo(node);

  return (
    <Group className={S.root} p="lg" gap="0.75rem" wrap="nowrap">
      <Center w="2.75rem" h="2.75rem" bdrs="50%" bg="background-secondary">
        <FixedSizeIcon name={getNodeIcon(node)} c="brand" size={20} />
      </Center>
      <Stack gap="xs" flex={1}>
        <Title className={CS.textWrap} order={3} lh="1.5rem">
          {getNodeLabel(node)}
        </Title>
        {location != null && <GraphBreadcrumbs links={location.links} />}
      </Stack>
      <Group m="-sm" gap="xs" wrap="nowrap">
        {link != null && (
          <GraphExternalLink label={link.label} url={link.url} />
        )}
        <ActionIcon aria-label={t`Close`} onClick={onClose}>
          <FixedSizeIcon name="close" />
        </ActionIcon>
      </Group>
    </Group>
  );
}
