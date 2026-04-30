import { useClipboard } from "@mantine/hooks";
import { match } from "ts-pattern";
import { t } from "ttag";

import { CodeEditor } from "metabase/common/components/CodeEditor";
import { ForwardRefLink } from "metabase/common/components/Link";
import type {
  MetabotAgentDataPartMessage,
  MetabotAgentEditSuggestionChatMessage,
} from "metabase/metabot/state";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Flex,
  Icon,
  Stack,
  Text,
} from "metabase/ui";
import type { MetabotCodeEdit } from "metabase-types/api";

import {
  CodeEditTablePills,
  NavigateToTablePills,
} from "./MetabotAgentDataSourcePills";
import { AgentSuggestionMessage } from "./MetabotAgentSuggestionMessage";
import { AgentTodoListMessage } from "./MetabotAgentTodoMessage";

type AgentDataPartMessageProps = {
  message: MetabotAgentDataPartMessage;
  readonly: boolean;
  debug: boolean;
};

export const AgentDataPartMessage = ({
  message,
  readonly,
  debug,
}: AgentDataPartMessageProps) =>
  match(message)
    .with({ part: { type: "todo_list" } }, ({ part }) => (
      <AgentTodoListMessage todos={part.value} />
    ))
    .with(
      { part: { type: "transform_suggestion" } },
      ({ id, part, metadata }) => {
        const suggestionMessage: MetabotAgentEditSuggestionChatMessage = {
          id,
          role: "agent",
          type: "edit_suggestion",
          model: "transform",
          payload: {
            editorTransform: metadata?.editorTransform,
            suggestedTransform: {
              ...part.value,
              id: part.value.id || undefined,
              active: true,
              suggestionId: metadata?.suggestionId ?? id,
            },
          },
        };

        return <AgentSuggestionMessage message={suggestionMessage} />;
      },
    )
    .with({ part: { type: "navigate_to" } }, ({ part }) => {
      const sourcePills = (
        <NavigateToTablePills
          path={part.value}
          messageId={readonly ? undefined : message.externalId}
        />
      );

      return debug ? (
        <Stack gap="md">
          <NavigateToDataPart type={part.type} path={part.value} />
          {sourcePills}
        </Stack>
      ) : (
        sourcePills
      );
    })
    .with({ part: { type: "code_edit" } }, ({ part, metadata }) => {
      const sourcePills = (
        <CodeEditTablePills
          value={part.value}
          buffer={metadata?.codeEditBuffer}
          messageId={readonly ? undefined : message.externalId}
        />
      );

      return debug ? (
        <Stack gap="md">
          <CodeEditDataPart type={part.type} value={part.value} />
          {sourcePills}
        </Stack>
      ) : (
        sourcePills
      );
    })
    .exhaustive((msg: unknown) => {
      console.warn("AgentDataPartMessage received an unexpected value:", msg);
      return null;
    });

const NavigateToDataPart = ({ type, path }: { type: string; path: string }) => (
  <Flex
    py="sm"
    px="md"
    bg="background-secondary"
    bd="1px solid var(--mb-color-border)"
    bdrs="sm"
    direction="row"
    align="center"
    justify="space-between"
    gap="sm"
  >
    <Flex align="center" gap="sm" style={{ minWidth: 0, flex: 1 }}>
      <Icon name="document" c="text-secondary" />
      <Text fw="bold">{type}</Text>
    </Flex>
    <Button
      component={ForwardRefLink}
      to={path}
      target="_blank"
      variant="light"
      size="compact-xs"
    >{t`Visit`}</Button>
  </Flex>
);

const CodeEditDataPart = ({
  type,
  value,
}: {
  type: string;
  value: MetabotCodeEdit;
}) => {
  const clipboard = useClipboard();

  return (
    <Box
      bg="background-secondary"
      bd="1px solid var(--mb-color-border)"
      bdrs="sm"
    >
      <Flex
        py="sm"
        px="md"
        direction="row"
        align="center"
        justify="space-between"
      >
        <Flex align="center" gap="sm">
          <Icon name="document" c="text-secondary" />
          <Text fw="bold">{type}</Text>
          <Text c="text-secondary">{t`Buffer ID: ${value.buffer_id}`}</Text>
          <Badge variant="light" size="sm">
            {value.mode}
          </Badge>
        </Flex>
        <ActionIcon h="sm" onClick={() => clipboard.copy(value.value)}>
          <Icon name="copy" size="1rem" />
        </ActionIcon>
      </Flex>
      <Box
        bg="background-primary"
        style={{
          borderTop: "1px solid var(--mb-color-border)",
          borderBottomLeftRadius: "var(--mantine-radius-sm)",
          borderBottomRightRadius: "var(--mantine-radius-sm)",
          overflow: "hidden",
        }}
      >
        <CodeEditor value={value.value} language="sql" readOnly />
      </Box>
    </Box>
  );
};
