import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { match } from "ts-pattern";
import { t } from "ttag";

import type { ColorName } from "metabase/lib/colors/types";
import { Collapse, Flex, Group, Icon, Paper, Stack, Text } from "metabase/ui";
import type { MetabotTodoItem } from "metabase-types/api";

import S from "./MetabotAgentTodoMessage.module.css";

type TodoStatusConfig = {
  color: ColorName;
  td?: string;
};

const todoStatusConfig: Record<MetabotTodoItem["status"], TodoStatusConfig> = {
  completed: { color: "text-secondary", td: "line-through" },
  in_progress: { color: "text-primary" },
  cancelled: { td: "line-through", color: "text-secondary" },
  pending: { color: "text-primary" },
};

export const AgentTodoListMessage = ({
  todos,
}: {
  todos: MetabotTodoItem[];
}) => {
  const [opened, { toggle }] = useDisclosure(true);

  return (
    <Paper shadow="none" radius="md" className={S.todoContainer}>
      <Group
        align="center"
        justify="space-between"
        onClick={toggle}
        className={S.todoHeader}
        py="sm"
        px="md"
        data-testid="todo-list-header"
      >
        <Flex align="center" justify="center">
          <Icon name="list" size=".75rem" mr="xs" c="brand" />
          <Text size="sm" fw="bold" c="brand">{t`Todo List`}</Text>
        </Flex>
        <Flex align="center" justify="center" h="md">
          <Icon
            name={opened ? "chevrondown" : "chevronup"}
            size=".75rem"
            c="brand"
          />
        </Flex>
      </Group>

      <Collapse
        in={opened}
        transitionDuration={opened ? 200 : 0}
        pb="sm"
        px="md"
      >
        <Stack gap="sm" w="100%" pb="xs">
          {todos.map((todo) => {
            const config = todoStatusConfig[todo.status];

            return (
              <Flex key={todo.id} bdrs="sm" align="flex-start">
                {match(todo.status)
                  .with("pending", () => (
                    <Flex
                      className={cx(S.statusIndicator, S.pendingIndicator)}
                      align="center"
                      justify="center"
                      mr="sm"
                    />
                  ))
                  .with("completed", () => (
                    <Flex
                      className={S.statusIndicator}
                      align="center"
                      justify="center"
                      mr="sm"
                    >
                      <Icon name="check" size=".7rem" c="white" />
                    </Flex>
                  ))
                  .with("in_progress", () => (
                    <Flex
                      className={S.statusIndicator}
                      align="center"
                      justify="center"
                      mr="sm"
                    >
                      <Icon name="arrow_right" size=".6rem" c="white" />
                    </Flex>
                  ))
                  .with("cancelled", () => (
                    <Flex
                      className={S.statusIndicator}
                      bg="brand"
                      align="center"
                      justify="center"
                      mr="sm"
                    >
                      <Icon name="close" size=".7rem" c="white" />
                    </Flex>
                  ))
                  .exhaustive()}
                <Text td={config.td} lh="md" size="sm" c={config.color}>
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
