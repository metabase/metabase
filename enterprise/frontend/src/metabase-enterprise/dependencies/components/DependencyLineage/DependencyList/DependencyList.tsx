import { useDebouncedValue } from "@mantine/hooks";
import { memo, useMemo, useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
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
  getMatchingNodes,
  getNodeSubtitleInfo,
  getNodeTitleInfo,
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
  const [searchText, setSearchText] = useState("");
  const [debouncedSearchText] = useDebouncedValue(
    searchText,
    SEARCH_DEBOUNCE_DURATION,
  );
  const matchingNodes = useMemo(
    () => getMatchingNodes(nodes, debouncedSearchText),
    [nodes, debouncedSearchText],
  );

  return (
    <Card className={S.root} shadow="none" withBorder>
      <ListHeader
        selection={selection}
        searchText={searchText}
        onSelectionChange={onSelectionChange}
        onSearchTextChange={setSearchText}
      />
      <ListBody nodes={matchingNodes} />
    </Card>
  );
}

type ListHeaderProps = {
  selection: GraphSelection;
  searchText: string;
  onSelectionChange: (selection?: GraphSelection) => void;
  onSearchTextChange: (searchText: string) => void;
};

function ListHeader({
  selection,
  searchText,
  onSelectionChange,
  onSearchTextChange,
}: ListHeaderProps) {
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
      <TextInput
        value={searchText}
        placeholder={t`Search`}
        leftSection={<Icon name="search" />}
        onChange={(event) => onSearchTextChange(event.target.value)}
      />
    </Stack>
  );
}

type ListBodyProps = {
  nodes: DependencyNode[];
};

const ListBody = memo(function ListBody({ nodes }: ListBodyProps) {
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

  return (
    <Flex
      className={S.item}
      component={Link}
      to={titleInfo.link ?? ""}
      direction="column"
      p="lg"
      gap="sm"
    >
      <ListItemLink info={titleInfo} />
      {subtitleInfo && <ListItemLink info={subtitleInfo} isSecondary />}
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
