import { memo } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import {
  ActionIcon,
  Box,
  FixedSizeIcon,
  Flex,
  Group,
  type IconName,
  Stack,
  UnstyledButton,
  rem,
} from "metabase/ui";
import type { DependencyEntry, DependencyNode } from "metabase-types/api";

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
  onEntryChange: (entry: DependencyEntry) => void;
};

export const PanelBody = memo(function ListBody({
  nodes,
  onEntryChange,
}: PanelBodyProps) {
  return (
    <div className={S.body}>
      {nodes.map((node) => (
        <ListItem
          key={getNodeId(node.id, node.type)}
          node={node}
          onEntryChange={onEntryChange}
        />
      ))}
    </div>
  );
});

type ListItemProps = {
  node: DependencyNode;
  onEntryChange: (entry: DependencyEntry) => void;
};

function ListItem({ node, onEntryChange }: ListItemProps) {
  const label = getNodeLabel(node);
  const icon = getNodeIcon(node);
  const location = getNodeLocationInfo(node);
  const link = getNodeLink(node);
  const viewCount = getNodeViewCount(node);

  const handleTitleClick = () => {
    onEntryChange({ id: node.id, type: node.type });
  };

  return (
    <Stack className={S.item} p="lg" gap="sm">
      <Group justify="space-between">
        <ListItemTitle
          label={label}
          icon={icon}
          onTitleClick={handleTitleClick}
        />
        {viewCount != null ? (
          <ListItemViewCount viewCount={viewCount} />
        ) : link != null ? (
          <ListItemLink link={link} />
        ) : null}
      </Group>
      {(location != null || (link != null && viewCount != null)) && (
        <Group justify={location != null ? "space-between" : "flex-end"}>
          {location != null && <ListItemSubtitle location={location} />}
          {link != null && viewCount != null && <ListItemLink link={link} />}
        </Group>
      )}
    </Stack>
  );
}

type ListItemTitleProps = {
  label: string;
  icon: IconName;
  onTitleClick: () => void;
};

function ListItemTitle({ label, icon, onTitleClick }: ListItemTitleProps) {
  return (
    <Flex
      component={UnstyledButton}
      className={S.textLink}
      gap="sm"
      align="center"
      onClick={onTitleClick}
    >
      <FixedSizeIcon name={icon} />
      <Box lh="h4">{label}</Box>
    </Flex>
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

function ListItemSubtitle({ location }: ListItemSubtitleProps) {
  return (
    <Flex
      className={S.textLink}
      component={Link}
      to={location.link}
      target="_blank"
      gap="sm"
      align="center"
    >
      <FixedSizeIcon name={location.icon} />
      <Box fz="sm" lh="h5">
        {location.label}
      </Box>
    </Flex>
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
