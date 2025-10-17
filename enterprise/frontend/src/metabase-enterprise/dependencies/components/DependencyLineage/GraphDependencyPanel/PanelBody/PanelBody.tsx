import { memo } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import {
  ActionIcon,
  Box,
  FixedSizeIcon,
  Flex,
  Group,
  Stack,
  UnstyledButton,
  rem,
} from "metabase/ui";
import type { DependencyEntry, DependencyNode } from "metabase-types/api";

import { ACTION_ICON_PADDING } from "../../constants";
import { getNodeId, getNodeLink, getNodeViewCount } from "../../utils";

import S from "./PanelBody.module.css";
import type { ListItemSubtitleInfo, ListItemTitleInfo } from "./types";
import {
  getNodeSubtitleInfo,
  getNodeTitleInfo,
  getNodeViewCountLabel,
} from "./utils";

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
  const titleInfo = getNodeTitleInfo(node);
  const subtitleInfo = getNodeSubtitleInfo(node);
  const link = getNodeLink(node);
  const viewCount = getNodeViewCount(node);

  const handleTitleClick = () => {
    onEntryChange({ id: node.id, type: node.type });
  };

  return (
    <Stack className={S.item} p="lg" gap="sm">
      <Group justify="space-between">
        <ListItemTitle titleInfo={titleInfo} onTitleClick={handleTitleClick} />
        {viewCount != null ? (
          <ListItemViewCount viewCount={viewCount} />
        ) : link != null ? (
          <ListItemLink link={link} />
        ) : null}
      </Group>
      {(subtitleInfo != null || (link != null && viewCount != null)) && (
        <Group justify={subtitleInfo != null ? "space-between" : "flex-end"}>
          {subtitleInfo != null && (
            <ListItemSubtitle subtitleInfo={subtitleInfo} />
          )}
          {link != null && viewCount != null && <ListItemLink link={link} />}
        </Group>
      )}
    </Stack>
  );
}

type ListItemTitleProps = {
  titleInfo: ListItemTitleInfo;
  onTitleClick: () => void;
};

function ListItemTitle({ titleInfo, onTitleClick }: ListItemTitleProps) {
  return (
    <Flex
      component={UnstyledButton}
      className={S.textLink}
      gap="sm"
      align="center"
      onClick={onTitleClick}
    >
      <FixedSizeIcon name={titleInfo.icon} />
      <Box lh="h4">{titleInfo.label}</Box>
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
  subtitleInfo: ListItemSubtitleInfo;
};

function ListItemSubtitle({ subtitleInfo }: ListItemSubtitleProps) {
  return (
    <Flex
      className={S.textLink}
      component={Link}
      to={subtitleInfo.link}
      target="_blank"
      gap="sm"
      align="center"
    >
      <FixedSizeIcon name={subtitleInfo.icon} />
      <Box fz="sm" lh="h5">
        {subtitleInfo.label}
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
