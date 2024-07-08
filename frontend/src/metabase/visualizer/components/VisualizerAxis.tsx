// eslint-disable-next-line no-restricted-imports
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
// eslint-disable-next-line no-restricted-imports
import { ActionIcon } from "@mantine/core";

import { Flex, Icon, Menu, Text } from "metabase/ui";

import {
  DRAGGABLE_ACTIVE_DIMENSION_TYPE,
  DRAGGABLE_ACTIVE_METRIC_TYPE,
} from "../dnd";

interface VisualizerAxisProps {
  direction?: "horizontal" | "vertical";
  columns: string[];
  columnOptions: Array<{ label: string; value: string }>;
  onColumnsChange: (columns: string[]) => void;
}

export function VisualizerAxis({
  direction = "horizontal",
  columns,
  columnOptions,
  onColumnsChange,
}: VisualizerAxisProps) {
  const handleColumnChange = (column: string, nextColumn: string) => {
    const nextColumns = columns.map(c => (c === column ? nextColumn : c));
    onColumnsChange(nextColumns);
  };

  const handleColumnAdd = (column: string) => {
    const nextColumns = [...columns, column];
    onColumnsChange(nextColumns);
  };

  const flexProps =
    direction === "vertical"
      ? {
          w: "16px",
          h: "100%",
        }
      : { w: "100%" };

  return (
    <Flex
      {...flexProps}
      pos="relative"
      justify="center"
      align="center"
      gap="md"
      bg="bg-light"
      py="sm"
      px="md"
      style={{ borderRadius: 99 }}
    >
      {columns.map(column => (
        <ColumnPicker
          key={column}
          column={column}
          columnOptions={columnOptions}
          direction={direction}
          onChange={nextColumn => handleColumnChange(column, nextColumn)}
        />
      ))}
      <AddColumnButton
        direction={direction}
        columns={columns}
        columnOptions={columnOptions}
        onAddColumn={handleColumnAdd}
      />
    </Flex>
  );
}

interface ColumnPickerProps {
  direction?: "horizontal" | "vertical";
  column: string;
  columnOptions: Array<{ label: string; value: string }>;
  onChange: (column: string) => void;
}

function ColumnPicker({
  column,
  columnOptions,
  direction = "horizontal",
  onChange,
}: ColumnPickerProps) {
  const type =
    direction === "horizontal" // 🥴
      ? DRAGGABLE_ACTIVE_DIMENSION_TYPE
      : DRAGGABLE_ACTIVE_METRIC_TYPE;

  const { attributes, listeners, transform, setNodeRef } = useDraggable({
    id: column,
    data: { type, column },
  });

  const option = columnOptions.find(option => option.value === column);

  const containerStyle =
    direction === "vertical"
      ? {
          position: "absolute",
          width: "200px",
          height: "14px",
          textAlign: "center",
          transform: transform
            ? CSS.Translate.toString(transform) + " rotate(-90deg)"
            : "rotate(-90deg)",
          cursor: "pointer",
        }
      : { cursor: "pointer", transform: CSS.Translate.toString(transform) };

  return (
    <Menu>
      <Menu.Target>
        <Flex
          {...attributes}
          {...listeners}
          align="center"
          style={containerStyle}
          ref={setNodeRef}
        >
          <Flex
            align="center"
            style={{
              border: "1px solid #ddd",
              borderRadius: 99,
              boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
            }}
            bg="white"
            px="sm"
            gap="4px"
          >
            <Icon name="grabber" size={12} />
            <Text color="text-medium" fw="bold">
              {option?.label ?? column}
            </Text>
            <Icon name="chevrondown" size={12} />
          </Flex>
        </Flex>
      </Menu.Target>
      <Menu.Dropdown>
        {columnOptions.map(option => (
          <Menu.Item
            key={option.value}
            value={option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

interface AddColumnButtonProps {
  direction?: "horizontal" | "vertical";
  columns: string[];
  columnOptions: Array<{ label: string; value: string }>;
  onAddColumn: (column: string) => void;
}

function AddColumnButton({
  direction = "horizontal",
  columns,
  columnOptions,
  onAddColumn,
}: AddColumnButtonProps) {
  const positionAttr = direction === "vertical" ? "top" : "right";

  const filteredOptions = columnOptions.filter(
    option => !columns.includes(option.value),
  );

  return (
    <Menu>
      <Menu.Target>
        <ActionIcon pos="absolute" style={{ [positionAttr]: 0 }}>
          <Icon name="add" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {filteredOptions.map(option => (
          <Menu.Item
            key={option.value}
            value={option.value}
            onClick={() => onAddColumn(option.value)}
          >
            {option.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
