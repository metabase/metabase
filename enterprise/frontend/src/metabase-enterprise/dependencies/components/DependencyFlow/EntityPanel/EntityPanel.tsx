import { Link } from "react-router";

import { ActionIcon, Card, Flex, Icon, Title } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { getNodeLabel } from "../utils";

import { getNodeUrl } from "./utils";

type EntityPanelProps = {
  node: DependencyNode;
};

export function EntityPanel({ node }: EntityPanelProps) {
  const url = getNodeUrl(node);

  return (
    <Card p={0}>
      <Flex pl="lg" pr="md" py="lg" align="center">
        <Title order={4} mr="md">
          {getNodeLabel(node)}
        </Title>
        {url != null && (
          <ActionIcon component={Link} to={url} target="_blank">
            <Icon name="external" />
          </ActionIcon>
        )}
        <ActionIcon>
          <Icon name="close" />
        </ActionIcon>
      </Flex>
    </Card>
  );
}
