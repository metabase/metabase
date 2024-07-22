// eslint-disable-next-line no-restricted-imports
import { Chip } from "@mantine/core";
import { useRef, useState } from "react";
import { t } from "ttag";

import {
  Button,
  Card,
  Icon,
  Stack,
  Popover,
  NumberInput,
  TextInput,
  type ButtonProps,
} from "metabase/ui";
import type { VisualizationSettings } from "metabase-types/api";

interface YAxisPanelProps {
  isVisible: boolean;
  columns: string[];
  columnOptions: Array<{ label: string; value: string }>;
  settings: VisualizationSettings;
  onColumnsChange: (columns: string[]) => void;
  onSettingsChange: (settings: VisualizationSettings) => void;
  onClose: () => void;
}

export function YAxisPanel({
  isVisible,
  columns,
  columnOptions,
  settings,
  onColumnsChange,
  onSettingsChange,
  onClose,
}: YAxisPanelProps) {
  const [isGoalLinePopoverOpen, setGoalLinePopoverOpen] = useState(false);
  const goalLinePopoverTimeout = useRef<any>(null);
  const goalLine = useGoalLine(settings, onSettingsChange);

  const handleToggleColumn = (column: string) => {
    if (columns.includes(column)) {
      onColumnsChange(columns.filter(c => c !== column));
    } else {
      onColumnsChange([...columns, column]);
    }
  };

  const handleAddGoalLine = () => {
    goalLine.add();
    setGoalLinePopoverOpen(true);
  };

  const handleClose = () => {
    setGoalLinePopoverOpen(false);
    onClose();
  };

  return (
    <Card
      pos="absolute"
      left={0}
      top={0}
      h="100%"
      w="16rem"
      bg="bg-medium"
      shadow="md"
      onMouseLeave={handleClose}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateX(0)" : "translateX(-16rem)",
        transition: "transform 0.3s ease-out, opacity 0.3s ease-out",
      }}
    >
      <Stack spacing="xs" p="md">
        {columnOptions.map(option => (
          <Chip
            key={option.value}
            checked={columns.includes(option.value)}
            variant="outline"
            radius="sm"
            onChange={() => handleToggleColumn(option.value)}
          >
            {option.label}
          </Chip>
        ))}
        <Popover opened={isGoalLinePopoverOpen} position="right" offset={10}>
          <Popover.Target>
            {goalLine.isEnabled ? (
              <div
                onMouseEnter={() => {
                  clearTimeout(goalLinePopoverTimeout.current);
                  setGoalLinePopoverOpen(true);
                }}
                onMouseLeave={() => {
                  goalLinePopoverTimeout.current = setTimeout(() => {
                    setGoalLinePopoverOpen(false);
                  }, 1000);
                }}
              >
                <Chip
                  checked={goalLine.isVisible}
                  variant="outline"
                  radius="sm"
                  onChange={goalLine.toggle}
                >
                  {goalLine.label}
                </Chip>
              </div>
            ) : (
              <AddButton
                mt="lg"
                onClick={handleAddGoalLine}
              >{t`Add a goal`}</AddButton>
            )}
          </Popover.Target>
          <Popover.Dropdown
            p="md"
            onMouseEnter={() => clearTimeout(goalLinePopoverTimeout.current)}
            onMouseLeave={() => setGoalLinePopoverOpen(false)}
          >
            <TextInput
              label={t`Label`}
              value={goalLine.label}
              onChange={e => goalLine.setLabel(e.target.value)}
            />
            <NumberInput
              label={t`Value`}
              value={goalLine.value}
              mt="sm"
              onChange={value => goalLine.setValue(value || 0)}
            />
          </Popover.Dropdown>
        </Popover>
      </Stack>
    </Card>
  );
}

export function useGoalLine(
  settings: VisualizationSettings,
  setSettings: (settings: VisualizationSettings) => void,
) {
  // TODO Use getDefault functions from viz settings?
  const isEnabled = typeof settings["graph.show_goal"] === "boolean";
  const isVisible = settings["graph.show_goal"] ?? false;
  const label = settings["graph.goal_label"] ?? t`Goal`;
  const value = settings["graph.goal_value"] ?? 0;

  const add = () => {
    setSettings({
      ...settings,
      "graph.show_goal": true,
    });
  };

  const remove = () => {
    setSettings({
      ...settings,
      "graph.show_goal": true,
    });
  };

  const toggle = () => {
    setSettings({
      ...settings,
      "graph.show_goal": !isVisible,
    });
  };

  const setLabel = (label: string) => {
    setSettings({
      ...settings,
      "graph.goal_label": label,
    });
  };

  const setValue = (value: number) => {
    setSettings({
      ...settings,
      "graph.goal_value": value || 0,
    });
  };

  return {
    isEnabled,
    isVisible,
    label,
    value,
    add,
    remove,
    toggle,
    setLabel,
    setValue,
  };
}

function AddButton(props: ButtonProps) {
  return (
    <Button
      variant="outline"
      color="text-medium"
      compact
      leftIcon={<Icon name="add" />}
      w="8rem"
      {...props}
    />
  );
}
