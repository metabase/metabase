import { c, t } from "ttag";
import _ from "underscore";

import { Icon, Select, Flex, Text, Switch } from "metabase/ui";

import { dateFilterOptions, isDateFilter, type DateFilter } from "./utils";

interface CleanupCollectionModalFiltersProps {
  dateFilter: DateFilter;
  recursiveFilter: boolean;
  onDateFilterChange: (dateFilter: DateFilter) => void;
  onRecursiveFilterChange: (recursiveFilter: boolean) => void;
}

export const CleanupCollectionModalFilters = ({
  dateFilter,
  recursiveFilter,
  onDateFilterChange,
  onRecursiveFilterChange,
}: CleanupCollectionModalFiltersProps) => (
  <Flex
    mt="1.5rem"
    mb="1rem"
    w="100%"
    justify="space-between"
    direction={{ base: "column", md: "row" }}
    align={{ base: "start", md: "center" }}
    gap={{ base: "md", md: "none" }}
    style={{ marginInlineEnd: ".25rem" }}
  >
    <Text fw="bold" display="inline-flex" style={{ alignItems: "center" }}>
      {c(`Not used in over <time-span>`).jt`Not used in over ${(
        <Select
          icon={<Icon name="calendar" />}
          data={dateFilterOptions}
          value={dateFilter}
          onChange={option => {
            option && isDateFilter(option) && onDateFilterChange(option);
          }}
          mx=".5rem"
        />
      )}`}
    </Text>
    <Flex align="center">
      <Switch
        label={<Text>{t`Include items in sub-collections`}</Text>}
        role="switch"
        checked={recursiveFilter}
        onChange={e => onRecursiveFilterChange(e.target.checked)}
      />
    </Flex>
  </Flex>
);
