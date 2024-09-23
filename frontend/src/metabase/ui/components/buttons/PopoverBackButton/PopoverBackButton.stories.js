import { useState } from "react";

import { Box, Button, Flex, Menu, PopoverBackButton } from "metabase/ui";

const args = {
  children: "Back",
};

const argTypes = {
  children: { type: "string" },
};

const DefaultTemplate = args => {
  const [isNestedPopoverOpen, setIsNestedPopoverOpen] = useState(false);
  return (
    <Flex justify="center">
      <Menu>
        <Menu.Target>
          <Button variant="filled">Click to open</Button>
        </Menu.Target>
        <Menu.Dropdown>
          {isNestedPopoverOpen ? (
            <Box h="5rem">
              <PopoverBackButton
                {...args}
                onClick={() => setIsNestedPopoverOpen(false)}
              />
            </Box>
          ) : (
            <>
              <Menu.Item>Regular item</Menu.Item>
              <Menu.Item
                closeMenuOnClick={false}
                onClick={() => setIsNestedPopoverOpen(true)}
              >
                Nested item
              </Menu.Item>
            </>
          )}
        </Menu.Dropdown>
      </Menu>
    </Flex>
  );
};

const Default = DefaultTemplate.bind(args);

export default {
  title: "Buttons/PopoverBackButton",
  component: PopoverBackButton,
  args,
  argTypes,
};

export const Default_ = {
  render: Default,
  name: "Default",
};
