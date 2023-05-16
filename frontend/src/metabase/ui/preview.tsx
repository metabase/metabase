import React from "react";

import { Group, Text, Box, MantineProvider } from "@mantine/core";
import { Button } from "@ui/buttons/Button";
import { IconButton } from "@ui/buttons/ActionIcon";
import { Tabs } from "@ui/display/Tabs";
import { Select } from "@ui/input/Select";
import { Menu } from "@ui/overlay/Menu";

import { theme } from "@ui/theme";

const data = [
  {
    image: "https://img.icons8.com/clouds/256/000000/futurama-bender.png",
    label: "Bender Bending Rodríguez",
    value: "Bender Bending Rodríguez",
    description: "Fascinated with cooking",
  },

  {
    image: "https://img.icons8.com/clouds/256/000000/futurama-mom.png",
    label: "Carol Miller",
    value: "Carol Miller",
    description: "One of the richest people on Earth",
  },
  {
    image: "https://img.icons8.com/clouds/256/000000/homer-simpson.png",
    label: "Homer Simpson",
    value: "Homer Simpson",
    description: "Overweight, lazy, and often ignorant",
  },
  {
    image: "https://img.icons8.com/clouds/256/000000/spongebob-squarepants.png",
    label: "Spongebob Squarepants",
    value: "Spongebob Squarepants",
    description: "Not just a sponge",
  },
];

export function Preview() {
  return (
    <MantineProvider theme={theme}>
      <Box ml="auto" mr="auto" style={{ width: 900 }}>
        <Box mb="lg" mt="sm">
          <Button mr="sm">Hi there</Button>
          <Button variant="outline">Yo there</Button>
          <IconButton></IconButton>
        </Box>

        <Box>
          <Select label="Select a theme" data={data} />
        </Box>

        <Box my="sm">
          <Tabs defaultValue="one">
            <Tabs.List>
              <Tabs.Tab value="one">Tab 1</Tabs.Tab>
              <Tabs.Tab value="two">
                <Group>
                  Double click me to edit
                  <Menu>
                    <Menu.Target>
                      <Text>Drop down</Text>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item>Item 1</Menu.Item>
                      <Menu.Item>
                        <Menu position="right" trigger="hover">
                          <Menu.Target>
                            <Text>Item 2 {">"}</Text>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item>Sub item 1</Menu.Item>
                            <Menu.Item>Sub item 2</Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      </Menu.Item>
                      <Menu.Item>Item 3</Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Group>
              </Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="one">Tab 1 content</Tabs.Panel>
            <Tabs.Panel value="two">Tab 2 content</Tabs.Panel>
          </Tabs>
        </Box>
      </Box>
    </MantineProvider>
  );
}
