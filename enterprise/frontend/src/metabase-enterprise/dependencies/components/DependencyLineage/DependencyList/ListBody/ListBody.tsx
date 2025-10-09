import { memo } from "react";
import { Link } from "react-router";

import { Box, Flex, Group, Icon, Stack } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { getNodeId } from "../../utils";
import { getNodeViewCount } from "../utils";

import S from "./ListBody.module.css";
import type { LinkInfo } from "./types";
import {
  getNodeSubtitleInfo,
  getNodeTitleInfo,
  getNodeViewCountLabel,
} from "./utils";

type ListBodyProps = {
  nodes: DependencyNode[];
};

export const ListBody = memo(function ListBody({ nodes }: ListBodyProps) {
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
  const titleInfo = getNodeTitleInfo(node);
  const subtitleInfo = getNodeSubtitleInfo(node);
  const viewCount = getNodeViewCount(node);

  return (
    <Stack className={S.item} p="lg" gap="sm">
      <Group justify="space-between">
        <ListItemLink info={titleInfo} />
        {viewCount != null && (
          <Box c="text-secondary" fz="sm">
            {getNodeViewCountLabel(viewCount)}
          </Box>
        )}
      </Group>
      {subtitleInfo && <ListItemLink info={subtitleInfo} isSecondary />}
    </Stack>
  );
}

type ListItemLinkProps = {
  info: LinkInfo;
  isSecondary?: boolean;
};

function ListItemLink({ info, isSecondary }: ListItemLinkProps) {
  return (
    <Flex
      className={S.itemLink}
      component={Link}
      to={info.link ?? ""}
      target="_blank"
      gap="sm"
      align="center"
    >
      <Icon name={info.icon} />
      <Box fz={isSecondary ? "sm" : "md"} lh={isSecondary ? "h5" : "h4"}>
        {info.label}
      </Box>
    </Flex>
  );
}
