import { memo } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import {
  ActionIcon,
  Anchor,
  Box,
  FixedSizeIcon,
  Flex,
  Group,
  Stack,
  rem,
} from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { getDependencyLineageUrl } from "../../../../urls";
import { ACTION_ICON_PADDING } from "../../constants";
import type { NodeLocationInfo } from "../../types";
import {
  getNodeIcon,
  getNodeId,
  getNodeLabel,
  getNodeLink,
  getNodeLocationInfo,
  getNodeViewCount,
} from "../../utils";

import S from "./PanelBody.module.css";
import { getNodeViewCountLabel } from "./utils";

type PanelBodyProps = {
  nodes: DependencyNode[];
};

export const PanelBody = memo(function ListBody({ nodes }: PanelBodyProps) {
  return (
    <div className={S.body}>
      {nodes.map((node) => (
        <ListItem key={getNodeId(node.id, node.type)} node={node} />
      ))}
    </div>
  );
});

type ListItemProps = {
  node: DependencyNode;
};

function ListItem({ node }: ListItemProps) {
  const location = getNodeLocationInfo(node);
  const link = getNodeLink(node);
  const viewCount = getNodeViewCount(node);

  return (
    <Stack className={S.item} p="lg" gap="sm">
      <Group justify="space-between">
        <ListItemTitle node={node} />
        {viewCount != null ? (
          <ListItemViewCount viewCount={viewCount} />
        ) : link != null ? (
          <ListItemLink link={link} />
        ) : null}
      </Group>
      {(location != null || (link != null && viewCount != null)) && (
        <Group justify={location != null ? "space-between" : "flex-end"}>
          {location != null && <ListItemLocation location={location} />}
          {link != null && viewCount != null && <ListItemLink link={link} />}
        </Group>
      )}
    </Stack>
  );
}

type ListItemTitleProps = {
  node: DependencyNode;
};

function ListItemTitle({ node }: ListItemTitleProps) {
  const label = getNodeLabel(node);
  const icon = getNodeIcon(node);
  const link = getDependencyLineageUrl({ entry: node });

  return (
    <Anchor c="text-primary" component={Link} to={link}>
      <Flex gap="sm" align="center">
        <FixedSizeIcon name={icon} />
        <Box lh="h4">{label}</Box>
      </Flex>
    </Anchor>
  );
}

type ListItemViewCountProps = {
  viewCount: number;
};

function ListItemViewCount({ viewCount }: ListItemViewCountProps) {
  return (
    <Box c="text-secondary" fz="sm">
      {getNodeViewCountLabel(viewCount)}
    </Box>
  );
}

type ListItemSubtitleProps = {
  location: NodeLocationInfo;
};

function ListItemLocation({ location }: ListItemSubtitleProps) {
  return (
    <Anchor
      component={Link}
      to={location.link}
      target="_blank"
      c="text-primary"
    >
      <Flex gap="sm" align="center">
        <FixedSizeIcon name={location.icon} />
        <Box fz="sm" lh="h5">
          {location.label}
        </Box>
      </Flex>
    </Anchor>
  );
}

type ListItemLinkProps = {
  link: string;
};

function ListItemLink({ link }: ListItemLinkProps) {
  return (
    <ActionIcon
      component={Link}
      to={link}
      target="_blank"
      m={rem(-ACTION_ICON_PADDING)}
      aria-label={t`Open in a new tab`}
    >
      <FixedSizeIcon name="external" />
    </ActionIcon>
  );
}
