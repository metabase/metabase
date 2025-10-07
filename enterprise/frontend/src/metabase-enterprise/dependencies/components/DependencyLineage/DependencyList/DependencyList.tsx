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
import { useListNodeDependentsQuery } from "metabase-enterprise/api";
import type { DependencyNode } from "metabase-types/api";

import type { GraphSelection } from "../types";
import { getNodeId } from "../utils";

import S from "./DependencyList.module.css";
import type { LinkInfo } from "./types";
import {
  getHeaderLabel,
  getNodeSubtitle,
  getNodeTitle,
  getRequest,
} from "./utils";

type DependencyListProps = {
  selection: GraphSelection;
  onSelectionChange: (selection?: GraphSelection) => void;
};

export function DependencyList({
  selection,
  onSelectionChange,
}: DependencyListProps) {
  const { data: nodes = [] } = useListNodeDependentsQuery(
    getRequest(selection),
  );

  return (
    <Card p={0} shadow="none" withBorder>
      <ListHeader selection={selection} onSelectionChange={onSelectionChange} />
      {nodes.map((node) => (
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
  const titleLink = getNodeTitle(node);
  const subtitleLink = getNodeSubtitle(node);

  return (
    <Flex
      className={S.item}
      component={Link}
      to={titleLink.link ?? ""}
      direction="column"
      p="lg"
      gap="sm"
    >
      <ListItemLink info={titleLink} />
      {subtitleLink && <ListItemLink info={subtitleLink} isSecondary />}
    </Flex>
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
      gap="sm"
      to={info.link ?? ""}
      target="_blank"
    >
      <Icon name={info.icon} />
      <Box fz={isSecondary ? "sm" : "md"} lh={isSecondary ? "h5" : "h4"}>
        {info.label}
      </Box>
    </Flex>
  );
}
