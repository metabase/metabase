import { t } from "ttag";

import { ActionIcon, Group, Icon, Stack, TextInput, Title } from "metabase/ui";

import type { GraphSelection } from "../../types";

import { getHeaderLabel } from "./utils";

type ListHeaderProps = {
  selection: GraphSelection;
  searchText: string;
  onSelectionChange: (selection?: GraphSelection) => void;
  onSearchTextChange: (searchText: string) => void;
};

export function ListHeader({
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
