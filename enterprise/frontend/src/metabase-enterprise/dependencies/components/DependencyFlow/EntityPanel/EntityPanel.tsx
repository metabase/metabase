import { Link } from "react-router";

import { ActionIcon, Card, Flex, Icon, Title } from "metabase/ui";
import type { DependencyInfo, DependencyNode } from "metabase-types/api";

import { getNodeUrl } from "./utils";

const INFO: DependencyInfo = {
  id: 1,
  type: "card",
  data: {
    id: 1,
    name: "Amazing Accounts",
    description: "All info about accounts",
    type: "model",
    display: "table",
    collection_id: "root",
    dashboard_id: null,
    collection: {
      id: "root",
      name: "Our analytics",
      description: null,
      location: "/",
      can_write: false,
      can_restore: false,
      can_delete: false,
      archived: false,
    },
    dashboard: null,
  },
  usage: {
    questions: [
      {
        id: 1,
        type: "question",
        name: "Count of accounts",
        description: null,
        display: "scalar",
        collection_id: "root",
        collection: {
          id: "root",
          name: "Our analytics",
          description: null,
          location: "/",
          can_write: false,
          can_restore: false,
          can_delete: false,
          archived: false,
        },
        dashboard_id: 1,
        dashboard: {
          id: 1,
          name: "Accounts dashboard",
        },
      },
    ],
  },
};

type EntityPanelProps = {
  node: DependencyNode;
};

export function EntityPanel({ node }: EntityPanelProps) {
  const url = getNodeUrl(INFO);

  return (
    <Card p={0}>
      <Flex pl="lg" pr="md" py="lg" align="center">
        <Title order={4} mr="md">
          {node.data.name}
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
