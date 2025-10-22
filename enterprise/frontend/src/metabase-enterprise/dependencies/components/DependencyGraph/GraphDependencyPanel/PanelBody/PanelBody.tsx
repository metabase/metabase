import { memo } from "react";

import * as Urls from "metabase/lib/urls";
import { Box, Group, Stack } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

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
};

export const PanelBody = memo(function ListBody({ nodes }: PanelBodyProps) {
  return (
    <Box className={S.body}>
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
        <GraphLink
          label={getNodeLabel(node)}
          icon={getNodeIcon(node)}
          url={Urls.dependencyGraph({ entry: node })}
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
        <Group justify={location != null ? "space-between" : "flex-end"}>
          {location != null && (
            <GraphBreadcrumbs location={location} withIcon />
          )}
          {link != null && viewCount != null && (
            <GraphExternalLink label={link.label} url={link.url} />
          )}
        </Group>
      )}
    </Stack>
  );
}
