import { c, t } from "ttag";
import _ from "underscore";

import { Icon, Select, Button, Flex, Modal, Text } from "metabase/ui";

import CS from "./CleanupCollectionModalHeader.module.css";
import { dateFilterOptions, isDateFilter, type DateFilter } from "./utils";

interface CleanupCollectionModalHeaderProps {
  dateFilter: DateFilter;
  onDateFilterChange: (dateFilter: DateFilter) => void;
  onClose: () => void;
}

export const CleanupCollectionModalHeader = ({
  dateFilter,
  onDateFilterChange,
  onClose,
}: CleanupCollectionModalHeaderProps) => (
  <Flex
    justify="space-between"
    w="100%"
    direction={{ base: "column", md: "row" }}
    align={{ base: "start", md: "center" }}
    gap={{ base: "md", md: "none" }}
  >
    <Flex w={{ base: "100%" }} justify="space-between" align="center">
      <Modal.Title fz="20px">{t`Items that haven’t been viewed in a while`}</Modal.Title>
      <Button
        variant="filled"
        onClick={onClose}
        display={{ base: "block", md: "none" }}
        className={CS.noShrink}
        style={{ marginInlineStart: "1rem" }}
      >{t`Done`}</Button>
    </Flex>
    <Flex
      gap="sm"
      align={{ base: "start", md: "center" }}
      direction={{ base: "column", md: "row" }}
      className={CS.noShrink}
    >
      <Text fw="bold">{c(
        `Prefixes a time span, reads as "Not viewed in over 6 months"`,
      ).t`Not viewed in over`}</Text>
      <Select
        icon={<Icon name="calendar" />}
        id="not-view-in-filter"
        data={dateFilterOptions}
        value={dateFilter}
        onChange={option => {
          option && isDateFilter(option) && onDateFilterChange(option);
        }}
        style={{ marginInlineEnd: ".25rem" }}
      />
      <Button
        variant="filled"
        onClick={onClose}
        className={CS.noShrink}
        display={{ base: "none", md: "block" }}
      >{t`Done`}</Button>
    </Flex>
  </Flex>
);
