import { useClipboard } from "@mantine/hooks";
import { useMemo } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { CodeEditor } from "metabase/common/components/CodeEditor";
import { ForwardRefLink } from "metabase/common/components/Link";
import type { MetabotAgentDataPartMessage } from "metabase/metabot/state";
import { ActionIcon, Badge, Box, Button, Flex, Icon, Text } from "metabase/ui";
import type {
  MetabotCodeEdit,
  MetabotSuggestedTransform,
} from "metabase-types/api";

import { AgentSuggestionMessage } from "./MetabotAgentSuggestionMessage";
import { AgentTodoListMessage } from "./MetabotAgentTodoMessage";

export const AgentDataPartMessage = ({
  message,
  readonly,
  debug,
}: {
  message: MetabotAgentDataPartMessage;
  readonly: boolean;
  debug: boolean;
}) => {
  const { part, metadata } = message;

  return match(part)
    .with({ type: "todo_list" }, (todoPart) => (
      <AgentTodoListMessage todos={todoPart.value} />
    ))
    .with({ type: "transform_suggestion" }, (tsPart) => {
      const suggestedTransform: MetabotSuggestedTransform = {
        ...tsPart.value,
        active: true,
        suggestionId: metadata?.suggestionId ?? message.id,
      };
      return (
        <AgentSuggestionMessage
          payload={{
            editorTransform: metadata?.editorTransform,
            suggestedTransform,
          }}
          readonly={readonly}
        />
      );
    })
    .with({ type: "navigate_to" }, (p) =>
      debug ? <NavigateToDataPart type={p.type} path={p.value} /> : null,
    )
    .with({ type: "code_edit" }, (p) =>
      debug ? <CodeEditDataPart type={p.type} value={p.value} /> : null,
    )
    .with({ type: "adhoc_viz" }, (p) =>
      debug ? <DataPartJsonCard type={p.type} value={p.value} /> : null,
    )
    .with({ type: "static_viz" }, (p) =>
      debug ? <DataPartJsonCard type={p.type} value={p.value} /> : null,
    )
    .exhaustive((part: unknown) => {
      console.warn("AgentDataPartMessage received an unexpected value:", part);
      return null;
    });
};

const DataPartJsonCard = ({
  type,
  value,
}: {
  type: string;
  value: unknown;
}) => {
  const clipboard = useClipboard();
  const formatted = useMemo(() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);

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
        <Flex align="center">
          <Icon name="document" c="text-secondary" mr="sm" />
          <Text fw="bold">{type}</Text>
        </Flex>
        <ActionIcon h="sm" onClick={() => clipboard.copy(formatted)}>
          <Icon name="copy" size="1rem" />
        </ActionIcon>
      </Flex>
      <Box
        p="sm"
        bg="background-primary"
        style={{
          borderTop: "1px solid var(--mb-color-border)",
          borderBottomLeftRadius: "var(--mantine-radius-sm)",
          borderBottomRightRadius: "var(--mantine-radius-sm)",
        }}
      >
        <Box
          component="pre"
          m={0}
          style={{
            fontFamily: "var(--mb-default-monospace-font-family)",
            fontSize: "0.75rem",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            overflowX: "auto",
          }}
        >
          {formatted}
        </Box>
      </Box>
    </Box>
  );
};

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
  >
    <Flex align="center">
      <Icon name="document" c="text-secondary" mr="sm" />
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
