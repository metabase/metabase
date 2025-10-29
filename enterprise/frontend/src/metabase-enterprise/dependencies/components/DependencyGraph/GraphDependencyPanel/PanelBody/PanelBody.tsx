import { memo } from "react";

import { Box, Group, Stack } from "metabase/ui";
import type { DependencyEntry, DependencyNode } from "metabase-types/api";

import { GraphBreadcrumbs } from "../../GraphBreadcrumbs";
import { GraphExternalLink } from "../../GraphExternalLink";
import { GraphLink } from "../../GraphLink";
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
  getGraphUrl: (entry: DependencyEntry) => string;
};

export const PanelBody = memo(function ListBody({
  nodes,
  getGraphUrl,
}: PanelBodyProps) {
  return (
    <Box className={S.body}>
      {nodes.map((node) => (
        <ListItem
          key={getNodeId(node.id, node.type)}
          node={node}
          getGraphUrl={getGraphUrl}
        />
      ))}
    </Box>
  );
});

type ListItemProps = {
  node: DependencyNode;
  getGraphUrl: (entry: DependencyEntry) => string;
};

function ListItem({ node, getGraphUrl }: ListItemProps) {
  const label = getNodeLabel(node);
  const link = getNodeLink(node);
  const location = getNodeLocationInfo(node);
  const viewCount = getNodeViewCount(node);

  return (
    <Stack className={S.item} p="lg" gap="sm" aria-label={label}>
      <Group justify="space-between" wrap="nowrap">
        <GraphLink
          label={label}
          icon={getNodeIcon(node)}
          url={getGraphUrl(node)}
        />
        {viewCount != null ? (
          <Box c="text-secondary" fz="sm" lh="1rem">
            {getNodeViewCountLabel(viewCount)}
          </Box>
        ) : link != null ? (
          <GraphExternalLink label={link.label} url={link.url} />
        ) : null}
      </Group>
      {(location != null || (link != null && viewCount != null)) && (
        <Group
          justify={location != null ? "space-between" : "flex-end"}
          wrap="nowrap"
        >
          {location != null && (
            <GraphBreadcrumbs location={location} ml="1rem" pl="sm" />
          )}
          {link != null && viewCount != null && (
            <GraphExternalLink label={link.label} url={link.url} />
          )}
        </Group>
      )}
    </Stack>
  );
}
