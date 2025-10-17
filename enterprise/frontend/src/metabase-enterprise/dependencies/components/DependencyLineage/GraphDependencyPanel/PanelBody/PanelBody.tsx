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

import { getNodeId, getNodeLink, getNodeViewCount } from "../../utils";

import S from "./PanelBody.module.css";
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
        <Flex
          component={UnstyledButton}
          className={S.textLink}
          gap="sm"
          align="center"
          onClick={handleTitleClick}
        >
          <FixedSizeIcon name={titleInfo.icon} />
          <Box lh="h4">{titleInfo.label}</Box>
        </Flex>
        {viewCount != null && (
          <Box c="text-secondary" fz="sm">
            {getNodeViewCountLabel(viewCount)}
          </Box>
        )}
      </Group>
      <Group justify={subtitleInfo != null ? "space-between" : "flex-end"}>
        {subtitleInfo != null && (
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
        )}
        {link != null && (
          <ActionIcon
            component={Link}
            to={link}
            target="_blank"
            m={rem(-6)}
            aria-label={t`Open in a new tab`}
          >
            <FixedSizeIcon name="external" />
          </ActionIcon>
        )}
      </Group>
    </Stack>
  );
}
