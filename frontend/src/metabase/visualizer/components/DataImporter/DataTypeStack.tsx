import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";

import { Flex, Icon, type IconName, Popover, Text } from "metabase/ui";
import {
  isCoordinate,
  isCurrency,
  isDate,
  isLocation,
} from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn } from "metabase-types/api";

import S from "./DataTypeStack.module.css";

interface DataTypeStackProps {
  columns: DatasetColumn[];
}

export function DataTypeStack({ columns }: DataTypeStackProps) {
  const [isOpen, { open, close }] = useDisclosure();

  const filteredColumns = useMemo(
    () =>
      columns.filter(
        col =>
          isCoordinate(col) ||
          isCurrency(col) ||
          isDate(col) ||
          isLocation(col),
      ),
    [columns],
  );

  return (
    <Popover opened={isOpen} position="right-start">
      <Popover.Target>
        <Flex className={S.root} onMouseEnter={open} onMouseLeave={close}>
          {filteredColumns.slice(0, 3).map(column => (
            <Flex key={column.name} className={S.iconContainer}>
              <Icon name={getIcon(column)} />
            </Flex>
          ))}
        </Flex>
      </Popover.Target>
      <Popover.Dropdown>
        <ul>
          {filteredColumns.map(column => (
            <li key={column.name} className={S.popoverListItem}>
              <Icon name={getIcon(column)} />
              <Text>{column.display_name}</Text>
            </li>
          ))}
        </ul>
      </Popover.Dropdown>
    </Popover>
  );
}

function getIcon(column: DatasetColumn): IconName {
  if (isDate(column)) {
    return "calendar";
  }
  if (isLocation(column)) {
    return "pinmap";
  }
  if (isCurrency(column)) {
    return "int";
  }
  return "list";
}
