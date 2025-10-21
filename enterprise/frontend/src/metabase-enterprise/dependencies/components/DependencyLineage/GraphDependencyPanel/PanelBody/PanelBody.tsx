import cx from "classnames";
import { memo } from "react";
import { Link } from "react-router";

import { ForwardRefLink } from "metabase/common/components/Link";
import * as Urls from "metabase/lib/urls";
import {
  ActionIcon,
  Anchor,
  Box,
  FixedSizeIcon,
  Flex,
  Group,
  Stack,
  Tooltip,
  rem,
} from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { ACTION_ICON_PADDING } from "../../constants";
import type { LinkWithLabelInfo, LinkWithTooltipInfo } from "../../types";
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
    <Box className={S.body} lh="1rem">
      {nodes.map((node) => (
        <ListItem key={getNodeId(node.id, node.type)} node={node} />
      ))}
    </Box>
  );
});

type ListItemProps = {
  node: DependencyNode;
};

function ListItem({ node }: ListItemProps) {
  const link = getNodeLink(node);
  const location = getNodeLocationInfo(node);
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
  const link = Urls.dependencyLineage({ entry: node });

  return (
    <Anchor className={cx(S.link, S.primary)} component={Link} to={link}>
      <Flex gap="sm" align="center">
        <FixedSizeIcon name={icon} c="brand" />
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
  location: LinkWithLabelInfo;
};

function ListItemLocation({ location }: ListItemSubtitleProps) {
  return (
    <Anchor
      className={cx(S.link, S.secondary)}
      component={Link}
      to={location.url}
      target="_blank"
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
  link: LinkWithTooltipInfo;
};

function ListItemLink({ link }: ListItemLinkProps) {
  return (
    <Tooltip label={link.tooltip}>
      <ActionIcon
        component={ForwardRefLink}
        to={link.url}
        target="_blank"
        m={rem(-ACTION_ICON_PADDING)}
        aria-label={link.tooltip}
      >
        <FixedSizeIcon name="external" />
      </ActionIcon>
    </Tooltip>
  );
}
