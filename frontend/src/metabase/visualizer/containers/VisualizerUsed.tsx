/* eslint-disable */
/* Use ActionIcon */
import { t } from "ttag";

import { Menu, Flex, Card, Title, Icon, IconName, Text } from "metabase/ui";
import type { Card as ICard } from "metabase-types/api";
import { ActionIcon } from "@mantine/core";

export function VisualizerUsed({ cards }: { cards?: ICard[] }) {
  return (
    <Card h="100%">
      <Title order={4}>{t`Being used`}</Title>
      {cards?.map((card, index) => {
        return (
          <Flex key={index} py="sm" align="center">
            {/* TODO - create a dark variant  */}
            <Menu>
              <Menu.Target>
                <ActionIcon mr="sm">
                  <Icon name={card.display as IconName} />
                  <Icon name="chevrondown" size={8} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown bg="black.0">
                <Menu.Item>
                  <Flex align="center">
                    <Icon name="bar" color="white" />
                    <Text ml="sm" color="white">{t`Bar`}</Text>
                  </Flex>
                </Menu.Item>
                <Menu.Item>
                  <Flex align="center">
                    <Icon name="line" color="white" />
                    <Text ml="sm" color="white">{t`Line`}</Text>
                  </Flex>
                </Menu.Item>
                <Menu.Item>
                  <Flex align="center">
                    <Icon name="pie" color="white" />
                    <Text ml="sm" color="white">{t`Pie`}</Text>
                  </Flex>
                </Menu.Item>
                <Menu.Item>
                  <Flex align="center">
                    <Icon name="ellipsis" />
                    <Text ml="sm">{t`More`}</Text>
                  </Flex>
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
            <div>{card.name}</div>
            <Flex ml="auto">
              <ActionIcon mr="sm">
                <Icon
                  name={
                    card.dataset_query.type === "native" ? "sql" : "notebook"
                  }
                />
              </ActionIcon>
              <Menu>
                <Menu.Target>
                  <ActionIcon>
                    <Icon name="ellipsis" />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item>{t`Refresh`}</Menu.Item>
                  <Menu.Item>{t`Remove`}</Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Flex>
          </Flex>
        );
      })}
    </Card>
  );
}
