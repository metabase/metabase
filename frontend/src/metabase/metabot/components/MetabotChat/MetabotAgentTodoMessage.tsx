import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { match } from "ts-pattern";
import { t } from "ttag";

import { Collapse, Flex, Group, Icon, Paper, Stack, Text } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";
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
    <Paper shadow="none" radius="sm" className={S.todoContainer}>
      <Group
        align="center"
        justify="space-between"
        onClick={toggle}
        className={S.todoHeader}
        py="sm"
        px="lg"
        data-testid="todo-list-header"
      >
        <Flex align="center" justify="center">
          <Icon name="list" size=".75rem" me="xxs" c="core-brand" />
          <Text size="sm" fw="bold" c="core-brand">{t`Todo List`}</Text>
        </Flex>
        <Flex align="center" justify="center" h="lg">
          <Icon
            name={opened ? "chevrondown" : "chevronup"}
            size=".75rem"
            c="core-brand"
          />
        </Flex>
      </Group>

      <Collapse
        in={opened}
        transitionDuration={opened ? 200 : 0}
        pb="sm"
        px="lg"
      >
        <Stack gap="sm" w="100%" pb="xxs">
          {todos.map((todo) => {
            const config = todoStatusConfig[todo.status];

            return (
              <Flex key={todo.id} bdrs="xs" align="flex-start">
                {match(todo.status)
                  .with("pending", () => (
                    <Flex
                      className={cx(S.statusIndicator, S.pendingIndicator)}
                      align="center"
                      justify="center"
                      me="sm"
                    />
                  ))
                  .with("completed", () => (
                    <Flex
                      className={S.statusIndicator}
                      align="center"
                      justify="center"
                      me="sm"
                    >
                      <Icon name="check" size=".7rem" c="core-white" />
                    </Flex>
                  ))
                  .with("in_progress", () => (
                    <Flex
                      className={S.statusIndicator}
                      align="center"
                      justify="center"
                      me="sm"
                    >
                      <Icon name="arrow_right" size=".6rem" c="core-white" />
                    </Flex>
                  ))
                  .with("cancelled", () => (
                    <Flex
                      className={S.statusIndicator}
                      bg="core-brand"
                      align="center"
                      justify="center"
                      me="sm"
                    >
                      <Icon name="close" size=".7rem" c="core-white" />
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
