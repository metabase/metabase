import { memo } from "react";
import { Link } from "react-router";

import { Box, Flex, Group, Icon, Stack, UnstyledButton } from "metabase/ui";
import type { DependencyEntry, DependencyNode } from "metabase-types/api";

import { getNodeId, getNodeViewCount } from "../../utils";

import S from "./ListBody.module.css";
import {
  getNodeSubtitleInfo,
  getNodeTitleInfo,
  getNodeViewCountLabel,
} from "./utils";

type ListBodyProps = {
  nodes: DependencyNode[];
  onEntryChange: (entry: DependencyEntry) => void;
};

export const ListBody = memo(function ListBody({
  nodes,
  onEntryChange,
}: ListBodyProps) {
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
  const viewCount = getNodeViewCount(node);

  const handleTitleClick = () => {
    onEntryChange({ id: node.id, type: node.type });
  };

  return (
    <Stack className={S.item} p="lg" gap="sm">
      <Group justify="space-between">
        <Flex
          component={UnstyledButton}
          className={S.itemLink}
          gap="sm"
          align="center"
          onClick={handleTitleClick}
        >
          <Icon name={titleInfo.icon} />
          <Box lh="h4">{titleInfo.label}</Box>
        </Flex>
        {viewCount != null && (
          <Box c="text-secondary" fz="sm">
            {getNodeViewCountLabel(viewCount)}
          </Box>
        )}
      </Group>
      {subtitleInfo && (
        <Flex
          className={S.itemLink}
          component={Link}
          to={subtitleInfo.link}
          target="_blank"
          gap="sm"
          align="center"
        >
          <Icon name={subtitleInfo.icon} />
          <Box fz="sm" lh="h5">
            {subtitleInfo.label}
          </Box>
        </Flex>
      )}
    </Stack>
  );
}
