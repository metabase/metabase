import { useDisclosure } from "@mantine/hooks";
import { type HTMLAttributes, useState } from "react";

import type { PillSize } from "metabase/core/components/ColorPill";
import { ColorPill } from "metabase/core/components/ColorPill";
import { ActionIcon, Center, Flex, Icon, Popover } from "metabase/ui";
import type {
  VizSettingColumnReference,
  VizSettingValueCondition,
} from "metabase-types/api";
import { isVizSettingValueConditions } from "metabase-types/guards";

import ColorSelectorPopover from "./ColorSelectorPopover";
import { ConditionalColorSelectorPopover } from "./ConditionalColorSelectorPopover";

export type ColorSelectorAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange" | "onSelect"
>;

export interface ColorSelectorProps extends ColorSelectorAttributes {
  value: string;
  settingValue: string | VizSettingColumnReference | VizSettingValueCondition;
  colors: string[];
  pillSize?: PillSize;
  onChange: (
    newValue: string | VizSettingColumnReference | VizSettingValueCondition,
  ) => void;
}

export const ColorSelector = ({
  value,
  settingValue,
  colors,
  onChange,
  ...props
}: ColorSelectorProps) => {
  const [opened, { toggle, close }] = useDisclosure(false);
  const [isSimpleMode, setIsSimpleMode] = useState(
    !isVizSettingValueConditions(settingValue),
  );

  return (
    <Popover opened={opened} onClose={close} position="bottom-start">
      <Popover.Target>
        <Center data-testid="color-selector-button">
          <ColorPill {...props} color={value} onClick={toggle} />
        </Center>
      </Popover.Target>
      <Popover.Dropdown>
        <Flex h="lg" w="100%" p="sm" mb="sm" justify="flex-end">
          <ActionIcon onClick={() => setIsSimpleMode(isOn => !isOn)}>
            <Icon name="bolt" />
          </ActionIcon>
        </Flex>
        {isSimpleMode ? (
          <ColorSelectorPopover
            value={value}
            colors={colors}
            onChange={onChange}
            onClose={close}
          />
        ) : (
          <ConditionalColorSelectorPopover
            value={
              isVizSettingValueConditions(settingValue)
                ? settingValue
                : undefined
            }
            onChange={onChange}
            onClose={close}
          />
        )}
      </Popover.Dropdown>
    </Popover>
  );
};
