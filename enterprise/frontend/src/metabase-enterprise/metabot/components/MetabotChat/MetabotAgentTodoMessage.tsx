import { useDisclosure } from "@mantine/hooks";
import { match } from "ts-pattern";
import { t } from "ttag";

import {
  Collapse,
  Flex,
  Group,
  Icon,
  type IconName,
  Paper,
  Stack,
  Text,
} from "metabase/ui";
import type { MetabotTodoItem } from "metabase-types/api";

type TodoStatusConfig = {
  icon: IconName;
  iconColor: string;
  color: string;
  td?: string;
};

const todoStatusConfig: Record<MetabotTodoItem["status"], TodoStatusConfig> = {
  completed: { icon: "check", iconColor: "success", color: "text-secondary" },
  in_progress: { icon: "play", iconColor: "brand", color: "text-primary" },
  cancelled: {
    icon: "close",
    iconColor: "text-light",
    td: "line-through",
    color: "text-secondary",
  },
  // TODO: Fix circle
  pending: {
    icon: "circle" as IconName,
    iconColor: "text-medium",
    color: "text-primary",
  },
};

export const AgentTodoListMessage = ({
  todos,
}: {
  todos: MetabotTodoItem[];
}) => {
  const [opened, { toggle }] = useDisclosure(true);

  return (
    <Paper
      shadow="none"
      radius="md"
      // eslint-disable-next-line no-color-literals
      bg="rgba(5, 114, 210, 0.07)"
      // eslint-disable-next-line no-color-literals
      style={{ border: `1px solid rgba(5, 114, 210, 0.69)` }}
    >
      <Group
        align="center"
        justify="space-between"
        onClick={toggle}
        styles={{ root: { cursor: "pointer" } }}
        py="sm"
        px="md"
      >
        {/* eslint-disable-next-line no-color-literals */}
        <Flex align="center" justify="center">
          <Icon
            name="list"
            size=".75rem"
            mr="xs"
            // eslint-disable-next-line no-color-literals
            c="rgba(5, 114, 210, 0.69)"
          />
          <Text
            size="sm"
            fw="bold"
            // eslint-disable-next-line no-color-literals
            c="rgba(5, 114, 210, 0.69)"
          >{t`Todos`}</Text>
        </Flex>
        <Flex align="center" justify="center" h="md">
          <Icon
            name={opened ? "chevrondown" : "chevronup"}
            size=".75rem"
            // eslint-disable-next-line no-color-literals
            c="rgba(5, 114, 210, 0.69)"
          />
        </Flex>
      </Group>

      <Collapse in={opened} pb="sm" px="md">
        <Stack gap="sm" w="100%" pb="xs">
          {todos.map((todo) => {
            const config = todoStatusConfig[todo.status];

            return (
              <Flex
                key={todo.id}
                style={{ borderRadius: "2px" }}
                align="flex-start"
              >
                {match(todo.status)
                  .with("pending", () => (
                    <Flex
                      h=".8rem"
                      w=".8rem"
                      style={{
                        borderRadius: "50%",
                        flexShrink: 0,
                        // eslint-disable-next-line no-color-literals
                        border: `1.5px solid rgba(5, 114, 210, 0.69)`,
                      }}
                      align="center"
                      justify="center"
                      mt="1px"
                      mr="sm"
                    />
                  ))
                  .with("completed", () => (
                    <Flex
                      h=".8rem"
                      w=".8rem"
                      // eslint-disable-next-line no-color-literals
                      bg="rgba(5, 114, 210, 0.69)"
                      style={{ borderRadius: "50%", flexShrink: 0 }}
                      align="center"
                      justify="center"
                      mt="2px"
                      mr="sm"
                    >
                      <Icon name="check" size=".7rem" c="white" />
                    </Flex>
                  ))
                  .with("in_progress", () => (
                    <Flex
                      h=".8rem"
                      w=".8rem"
                      // eslint-disable-next-line no-color-literals
                      bg="rgba(5, 114, 210, 0.69)"
                      style={{ borderRadius: "50%", flexShrink: 0 }}
                      align="center"
                      justify="center"
                      mt="2px"
                      mr="sm"
                    >
                      <Icon
                        name="arrow_right"
                        size=".6rem"
                        c="white"
                        style={{ transform: `rotate(180deg)` }}
                      />
                    </Flex>
                  ))
                  .with("cancelled", () => (
                    <Flex
                      h=".8rem"
                      w=".8rem"
                      // eslint-disable-next-line no-color-literals
                      bg="rgba(5, 114, 210, 0.69)"
                      style={{ borderRadius: "50%", flexShrink: 0 }}
                      align="center"
                      justify="center"
                      mt="2px"
                      mr="sm"
                    >
                      <Icon name="close" size=".7rem" c="white" />
                    </Flex>
                  ))
                  .otherwise(() => "blarf")}
                <Text lh="md" size="sm" td={config.td} c={config.color}>
                  {todo.content}
                </Text>
              </Flex>
            );
          })}
        </Stack>
      </Collapse>
    </Paper>
  );
};
