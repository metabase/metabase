import type { Location } from "history";
import { useState } from "react";
import { t } from "ttag";

import { Button, Flex, Group, Icon, Select, TextInput } from "metabase/ui";

import { TransformsInnerNav } from "../TransformsInnerNav";

import S from "./TransformsPageSidebar.module.css";

interface TransformsPageSidebarProps {
  location: Location;
}

export const TransformsPageSidebar = ({
  location,
}: TransformsPageSidebarProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortType, setSortType] = useState<string | null>("last-modified");

  return (
    <Flex direction="column" w={360} p="md" gap="md" className={S.root}>
      <TransformsInnerNav location={location} />

      <TextInput
        size="sm"
        placeholder={t`Search…`}
        leftSection={<Icon name="search" />}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      <Group gap="sm" wrap="nowrap">
        <Select
          size="sm"
          flex={1}
          value={sortType}
          onChange={setSortType}
          data={[
            { value: "last-modified", label: t`Last modified` },
            { value: "collections", label: t`Collections` },
          ]}
        />
        <Button
          p="sm"
          w={36}
          h={36}
          leftSection={<Icon name="add" size={16} />}
        />
      </Group>
    </Flex>
  );
};
