import { t } from "ttag";
import _ from "underscore";

import { Button, Flex, Modal } from "metabase/ui";

import { DateFilterSelect } from "./DateFilterSelect";
import { isDateFilter, type DateFilter } from "./utils";

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
    <Modal.Title fz="20px">{t`Items that haven’t been viewed in a while`}</Modal.Title>
    <Flex gap="md">
      <DateFilterSelect
        value={dateFilter}
        onChange={option => {
          option && isDateFilter(option) && onDateFilterChange(option);
        }}
        miw="18rem"
      />
      <Button variant="filled" onClick={onClose}>{t`Done`}</Button>
    </Flex>
  </Flex>
);
