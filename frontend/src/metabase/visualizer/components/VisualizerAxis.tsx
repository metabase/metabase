// eslint-disable-next-line no-restricted-imports
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
// eslint-disable-next-line no-restricted-imports
import { ActionIcon } from "@mantine/core";
import type { CSSProperties } from "react";

import { DoubleClickEditableText } from "metabase/core/components/EditableText";
import { color } from "metabase/lib/colors";
import { Flex, Icon, Menu } from "metabase/ui";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";

import {
  DRAGGABLE_ACTIVE_DIMENSION_TYPE,
  DRAGGABLE_ACTIVE_METRIC_TYPE,
} from "../dnd";

interface VisualizerAxisProps {
  direction?: "horizontal" | "vertical";
  columns: string[];
  columnOptions: Array<{ label: string; value: string }>;
  settings: ComputedVisualizationSettings;
  onColumnsChange: (columns: string[]) => void;
  onLabelChange: (column: string, label: string) => void;
}

export function VisualizerAxis({
  direction = "horizontal",
  columns,
  columnOptions,
  settings,
  onColumnsChange,
  onLabelChange,
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

  const axisLabelSettingKey =
    direction === "vertical" // 🥴
      ? "graph.y_axis.title_text"
      : "graph.x_axis.title_text";

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
          label={
            columns.length === 1 ? settings[axisLabelSettingKey] : undefined
          }
          columns={columns}
          columnOptions={columnOptions}
          direction={direction}
          onChangeColumn={nextColumn => handleColumnChange(column, nextColumn)}
          onChangeLabel={label => {
            onLabelChange(column, label);
          }}
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
  label?: string;
  columns: string[];
  columnOptions: Array<{ label: string; value: string }>;
  onChangeColumn: (column: string) => void;
  onChangeLabel: (label: string) => void;
}

function ColumnPicker({
  column,
  label,
  columns,
  columnOptions,
  direction = "horizontal",
  onChangeColumn,
  onChangeLabel,
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

  const filteredOptions = columnOptions.filter(
    option => !columns.includes(option.value) && option.value !== column,
  );

  const hasOptions = filteredOptions.length > 0;

  const containerStyle: CSSProperties =
    direction === "vertical"
      ? {
          position: "absolute",
          width: "200px",
          height: "14px",
          textAlign: "center",
          transform: transform
            ? CSS.Translate.toString(transform) + " rotate(-90deg)"
            : "rotate(-90deg)",
        }
      : { transform: CSS.Translate.toString(transform) };

  if (hasOptions) {
    containerStyle.cursor = "pointer";
  }

  return (
    <Menu disabled={!hasOptions}>
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
          <DoubleClickEditableText
            initialValue={label ?? option?.label ?? column}
            onChange={label => {
              if (label.length > 0) {
                onChangeLabel(label);
              }
            }}
            style={{ color: color("text-medium"), fontWeight: "bold" }}
          />
          {hasOptions && (
            <Menu.Target>
              <Icon name="chevrondown" size={12} />
            </Menu.Target>
          )}
        </Flex>
      </Flex>
      <Menu.Dropdown>
        {columnOptions.map(option => (
          <Menu.Item
            key={option.value}
            value={option.value}
            onClick={() => onChangeColumn(option.value)}
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

  if (filteredOptions.length === 0) {
    return null;
  }

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
