import { Link } from "react-router";
import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Card,
  Flex,
  Group,
  Icon,
  Stack,
  TextInput,
  Title,
} from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import type { GraphSelection } from "../types";
import { getNodeId } from "../utils";

import S from "./DependencyList.module.css";
import { getHeaderLabel, getNodeTitle } from "./utils";

const NODES: DependencyNode[] = [
  {
    id: 1,
    type: "card",
    data: { name: "Account", type: "model", display: "table" },
  },
  {
    id: 2,
    type: "table",
    data: {
      name: "account",
      db_id: 1,
      schema: "public",
      display_name: "Account",
    },
  },
];

type DependencyListProps = {
  selection: GraphSelection;
  onSelectionChange: (selection?: GraphSelection) => void;
};

export function DependencyList({
  selection,
  onSelectionChange,
}: DependencyListProps) {
  return (
    <Card p={0} shadow="none" withBorder>
      <ListHeader selection={selection} onSelectionChange={onSelectionChange} />
      {NODES.map((node) => (
        <ListItem key={getNodeId(node.id, node.type)} node={node} />
      ))}
    </Card>
  );
}

type ListHeaderProps = {
  selection: GraphSelection;
  onSelectionChange: (selection?: GraphSelection) => void;
};

function ListHeader({ selection, onSelectionChange }: ListHeaderProps) {
  return (
    <Stack pl="lg" pt="lg" pr="lg" gap="md">
      <Group wrap="nowrap">
        <Title flex={1} order={5}>
          {getHeaderLabel(selection)}
        </Title>
        <ActionIcon onClick={() => onSelectionChange(undefined)}>
          <Icon name="close" />
        </ActionIcon>
      </Group>
      <TextInput placeholder={t`Search`} leftSection={<Icon name="search" />} />
    </Stack>
  );
}

type ListItemProps = {
  node: DependencyNode;
};

function ListItem({ node }: ListItemProps) {
  const title = getNodeTitle(node);

  return (
    <Stack className={S.item} p="lg" gap="sm">
      <Flex
        className={S.link}
        component={Link}
        gap="sm"
        to={title.link ?? ""}
        target="_blank"
      >
        <Icon name={title.icon} />
        <Box>{title.label}</Box>
      </Flex>
    </Stack>
  );
}
