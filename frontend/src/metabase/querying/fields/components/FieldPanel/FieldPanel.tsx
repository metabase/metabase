import { useMemo, useState } from "react";
import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import { Box, Checkbox, Flex, Icon, Text, TextInput } from "metabase/ui";
import type * as Lib from "metabase-lib";

import type { ColumnGroupItem, ColumnItem } from "./types";
import {
  getColumnGroupItems,
  searchColumnGroupItems,
  toggleColumnGroupInQuery,
  toggleColumnInQuery,
} from "./utils";

interface FieldPanelProps {
  query: Lib.Query;
  stageIndex: number;
  onChange: (query: Lib.Query) => void;
}

export const FieldPanel = ({
  query,
  stageIndex,
  onChange,
}: FieldPanelProps) => {
  const [searchValue, setSearchValue] = useState("");

  const groupItems = useMemo(() => {
    return getColumnGroupItems(query, stageIndex);
  }, [query, stageIndex]);

  const visibleGroupItems = useMemo(
    () => searchColumnGroupItems(groupItems, searchValue),
    [groupItems, searchValue],
  );

  const handleColumnToggle = (columnItem: ColumnItem) => {
    onChange(toggleColumnInQuery(query, stageIndex, columnItem));
  };

  const handleGroupToggle = (groupItem: ColumnGroupItem) => {
    onChange(toggleColumnGroupInQuery(query, stageIndex, groupItem));
  };

  return (
    <div>
      <TextInput
        value={searchValue}
        onChange={e => setSearchValue(e.target.value)}
        rightSection={<Icon name="search" />}
        placeholder={t`Search for a column…`}
        mb="1rem"
      />
      {visibleGroupItems.map((groupItem, groupIndex) => {
        return (
          <div
            key={groupIndex}
            role="list"
            aria-label={groupItem.displayName}
            data-testid={`${groupItem.displayName.toLowerCase()}-table-columns`}
          >
            <Text fz="lg" fw={700} lh="1.5rem" mb="1rem" mt="1.75rem">
              {groupItem.displayName}
            </Text>
            <Box mb="1.5rem">
              <Checkbox
                variant="stacked"
                size="xs"
                label={
                  <Text fw={700} ml="0.375rem" lh="1rem">
                    {groupItem.isSelected ? t`Remove all` : t`Add all`}
                  </Text>
                }
                checked={groupItem.isSelected}
                disabled={groupItem.isDisabled}
                aria-label={groupItem.displayName}
                onChange={() => handleGroupToggle(groupItem)}
              />
            </Box>
            {groupItem.columnItems.map((columnItem, columnIndex) => (
              <Box mb="1rem" key={columnIndex}>
                <Checkbox
                  label={
                    <Flex ml="0.25rem" align="center">
                      <Icon name={getColumnIcon(columnItem.column)} />
                      <Text span ml="0.5rem" lh="1rem" fw={400}>
                        {columnItem.displayName}
                      </Text>
                    </Flex>
                  }
                  checked={columnItem.isSelected}
                  disabled={columnItem.isDisabled}
                  mb="1.5rem"
                  size="xs"
                  aria-label={columnItem.displayName}
                  onChange={() => handleColumnToggle(columnItem)}
                />
              </Box>
            ))}
          </div>
        );
      })}
    </div>
  );
};
