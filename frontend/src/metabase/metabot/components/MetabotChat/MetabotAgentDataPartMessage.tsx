import { useClipboard } from "@mantine/hooks";
import { useMemo } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import type { MetabotAgentDataPartMessage } from "metabase/metabot/state";
import { ActionIcon, Box, Button, Flex, Icon, Text } from "metabase/ui";
import type { MetabotSuggestedTransform } from "metabase-types/api";

import { AgentSuggestionMessage } from "./MetabotAgentSuggestionMessage";
import { AgentTodoListMessage } from "./MetabotAgentTodoMessage";

const DataPartJsonCard = ({
  title,
  value,
}: {
  title: string;
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
          <Text fw="bold">{title}</Text>
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
      variant="light"
      size="compact-xs"
    >{t`Visit`}</Button>
  </Flex>
);

export const AgentDataPartMessage = ({
  message,
  debug,
}: {
  message: MetabotAgentDataPartMessage;
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
        />
      );
    })
    .with({ type: "navigate_to" }, (p) =>
      debug ? <NavigateToDataPart type={p.type} path={p.value} /> : null,
    )
    .with({ type: "code_edit" }, (p) =>
      debug ? <DataPartJsonCard title={p.type} value={p.value} /> : null,
    )
    .with({ type: "adhoc_viz" }, (p) =>
      debug ? <DataPartJsonCard title={p.type} value={p.value} /> : null,
    )
    .with({ type: "static_viz" }, (p) =>
      debug ? <DataPartJsonCard title={p.type} value={p.value} /> : null,
    )
    .exhaustive();
};
