import type { StoryFn } from "@storybook/react";
import { type ReactNode, useState } from "react";

import {
  Box,
  Combobox,
  type ComboboxProps,
  Group,
  Input,
  useCombobox,
} from "metabase/ui";
import { StorySection, StoryShowcase } from "metabase/ui/stories/showcase";

const OPTIONS = ["Apple", "Banana", "Cherry", "Grape", "Orange"];

// make the stories viewport independent by disabling middlewares
const OVERVIEW_MIDDLEWARES = { shift: false, flip: false, size: false };

const DefaultTemplate: StoryFn<ComboboxProps> = () => {
  const combobox = useCombobox();
  const [value, setValue] = useState<string | null>(null);

  return (
    <Box w={256}>
      <Combobox
        store={combobox}
        onOptionSubmit={(nextValue) => {
          setValue(nextValue);
          combobox.closeDropdown();
        }}
      >
        <Combobox.Target>
          <Input
            component="button"
            type="button"
            pointer
            rightSection={<Combobox.Chevron />}
            rightSectionPointerEvents="none"
            onClick={() => combobox.toggleDropdown()}
          >
            {value ?? (
              <Input.Placeholder c="text-disabled">
                Pick a value
              </Input.Placeholder>
            )}
          </Input>
        </Combobox.Target>
        <Combobox.Dropdown>
          <Combobox.Options>
            {OPTIONS.map((option) => (
              <Combobox.Option key={option} value={option}>
                {option}
              </Combobox.Option>
            ))}
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>
    </Box>
  );
};

interface OpenComboboxProps {
  height: number;
  children: ReactNode;
}

const OpenCombobox = ({ height, children }: OpenComboboxProps) => {
  const combobox = useCombobox({ opened: true });

  return (
    <Box w={256} h={height}>
      <Combobox
        store={combobox}
        withinPortal={false}
        middlewares={OVERVIEW_MIDDLEWARES}
      >
        <Combobox.Target>
          <Input
            component="button"
            type="button"
            pointer
            rightSection={<Combobox.Chevron />}
            rightSectionPointerEvents="none"
            onClick={() => combobox.toggleDropdown()}
          >
            <Input.Placeholder c="text-disabled">
              Pick a value
            </Input.Placeholder>
          </Input>
        </Combobox.Target>
        <Combobox.Dropdown>{children}</Combobox.Dropdown>
      </Combobox>
    </Box>
  );
};

const OverviewTemplate: StoryFn<ComboboxProps> = () => (
  <StoryShowcase title="Combobox">
    <Group align="flex-start" gap="xxl">
      <StorySection title="Options">
        <OpenCombobox height={300}>
          <Combobox.Options>
            <Combobox.Option value="default">Default</Combobox.Option>
            <Combobox.Option value="hovered" data-option-state="hovered">
              Hovered
            </Combobox.Option>
            <Combobox.Option value="selected" selected>
              Selected
            </Combobox.Option>
            <Combobox.Option value="active" active>
              Active
            </Combobox.Option>
            <Combobox.Option value="disabled" disabled>
              Disabled
            </Combobox.Option>
          </Combobox.Options>
        </OpenCombobox>
      </StorySection>

      <StorySection title="Groups">
        <OpenCombobox height={300}>
          <Combobox.Options>
            <Combobox.Group label="Fruits">
              <Combobox.Option value="apple">Apple</Combobox.Option>
              <Combobox.Option value="banana">Banana</Combobox.Option>
            </Combobox.Group>
            <Combobox.Group label="Vegetables">
              <Combobox.Option value="carrot">Carrot</Combobox.Option>
              <Combobox.Option value="pepper">Pepper</Combobox.Option>
            </Combobox.Group>
          </Combobox.Options>
        </OpenCombobox>
      </StorySection>

      <StorySection title="Empty">
        <OpenCombobox height={300}>
          <Combobox.Options>
            <Combobox.Empty>Nothing found</Combobox.Empty>
          </Combobox.Options>
        </OpenCombobox>
      </StorySection>
    </Group>
  </StoryShowcase>
);

export default {
  title: "Components/Inputs/Combobox",
  component: Combobox,
};

export const Default = {
  render: DefaultTemplate,
};

export const Overview = {
  render: OverviewTemplate,
  parameters: {
    pseudo: {
      hover: ['[data-option-state="hovered"]'],
    },
    controls: { include: ["theme"] },
  },
};
