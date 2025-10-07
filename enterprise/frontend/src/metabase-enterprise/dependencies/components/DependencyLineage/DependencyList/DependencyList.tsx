import { ActionIcon, Card, Group, Icon, Title } from "metabase/ui";

import type { GraphSelection } from "../types";

import { getHeaderLabel } from "./utils";

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
    </Card>
  );
}

type ListHeaderProps = {
  selection: GraphSelection;
  onSelectionChange: (selection?: GraphSelection) => void;
};

function ListHeader({ selection, onSelectionChange }: ListHeaderProps) {
  return (
    <Group p="lg" wrap="nowrap">
      <Title flex={1} order={5}>
        {getHeaderLabel(selection)}
      </Title>
      <ActionIcon onClick={() => onSelectionChange(undefined)}>
        <Icon name="close" />
      </ActionIcon>
    </Group>
  );
}
