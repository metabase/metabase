import { useClipboard } from "@mantine/hooks";
import cx from "classnames";
import { useMemo } from "react";
import { match } from "ts-pattern";
import { jt, t } from "ttag";

import {
  skipToken,
  useGetCardQuery,
  useGetCollectionQuery,
  useGetDashboardQuery,
  useGetDocumentQuery,
} from "metabase/api";
import type { EntitySavedValue } from "metabase/api/ai-streaming/schemas";
import { CodeEditor } from "metabase/common/components/CodeEditor";
import { ForwardRefLink } from "metabase/common/components/Link";
import type { MetabotAgentDataPartMessage } from "metabase/metabot/state";
import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Flex,
  Icon,
  Skeleton,
  Stack,
  Text,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { MetabotCodeEdit } from "metabase-types/api";

import {
  CodeEditTablePills,
  NavigateToTablePills,
} from "./MetabotAgentDataSourcePills";
import { AgentSuggestionMessage } from "./MetabotAgentSuggestionMessage";
import { AgentTodoListMessage } from "./MetabotAgentTodoMessage";
import Styles from "./MetabotChat.module.css";
import { MetabotInlineChart } from "./MetabotInlineChart";

type AgentDataPartMessageProps = {
  message: MetabotAgentDataPartMessage;
  readonly: boolean;
  debug: boolean;
  conversationId: string;
};

export const AgentDataPartMessage = ({
  message,
  readonly,
  debug,
  conversationId,
}: AgentDataPartMessageProps) =>
  match(message)
    .with({ part: { type: "data-todo_list" } }, ({ part }) => (
      <AgentTodoListMessage todos={part.data} />
    ))
    .with({ part: { type: "data-transform_suggestion" } }, (msg) => (
      <AgentSuggestionMessage message={msg} readonly={readonly} />
    ))
    .with({ part: { type: "data-navigate_to" } }, ({ part }) => {
      const sourcePills = (
        <NavigateToTablePills
          path={part.data}
          messageId={readonly ? undefined : message.externalId}
        />
      );

      return (
        <Stack gap="md">
          {debug && <NavigateToDataPart type={part.type} path={part.data} />}
          {sourcePills}
        </Stack>
      );
    })
    .with({ part: { type: "data-code_edit" } }, ({ part, metadata }) => {
      const sourcePills = (
        <CodeEditTablePills
          value={part.data}
          buffer={metadata?.codeEditBuffer}
          messageId={readonly ? undefined : message.externalId}
        />
      );

      return (
        <Stack gap="md">
          {debug && <CodeEditDataPart type={part.type} value={part.data} />}
          {sourcePills}
        </Stack>
      );
    })
    .with(
      { part: { type: "data-generated_entity", data: { type: "card" } } },
      ({ part }) => (
        <Stack gap="md">
          {debug && <DataPartJsonCard type={part.type} value={part.data} />}
          <MetabotInlineChart
            value={part.data}
            readonly={readonly}
            conversationId={conversationId}
          />
        </Stack>
      ),
    )
    .with({ part: { type: "data-entity_saved" } }, ({ part }) => (
      <Stack gap="md">
        {debug && <DataPartJsonCard type={part.type} value={part.data} />}
        <EntitySavedMessage value={part.data} />
      </Stack>
    ))
    .with({ part: { type: "data-adhoc_viz" } }, ({ part }) =>
      debug ? <DataPartJsonCard type={part.type} value={part.data} /> : null,
    )
    .with({ part: { type: "data-static_viz" } }, ({ part }) =>
      debug ? <DataPartJsonCard type={part.type} value={part.data} /> : null,
    )
    .exhaustive((msg: unknown) => {
      console.warn("AgentDataPartMessage received an unexpected value:", msg);
      return null;
    });

const EntitySavedMessage = ({ value }: { value: EntitySavedValue }) => {
  const { destination } = value;

  const { data: card, isLoading: isCardLoading } = useGetCardQuery({
    id: value.card_id,
    ignore_error: true,
  });
  const { data: collection, isLoading: isCollectionLoading } =
    useGetCollectionQuery(
      destination.type === "collection"
        ? { id: destination.id ?? "root", ignore_error: true }
        : skipToken,
    );
  const { data: dashboard, isLoading: isDashboardLoading } =
    useGetDashboardQuery(
      destination.type === "dashboard"
        ? { id: destination.id, ignore_error: true }
        : skipToken,
    );
  const { data: document, isLoading: isDocumentLoading } = useGetDocumentQuery(
    destination.type === "document" ? { id: destination.id } : skipToken,
  );
  const container = match(destination)
    .with({ type: "dashboard" }, () =>
      dashboard
        ? { name: dashboard.name, url: Urls.dashboard(dashboard) }
        : null,
    )
    .with({ type: "document" }, () =>
      document ? { name: document.name, url: Urls.document(document) } : null,
    )
    .with({ type: "collection" }, () =>
      collection
        ? { name: collection.name, url: Urls.collection(collection) }
        : null,
    )
    .exhaustive();

  if (
    isCardLoading ||
    isCollectionLoading ||
    isDashboardLoading ||
    isDocumentLoading
  ) {
    return <Skeleton h="1rem" w="18rem" data-testid="entity-saved-loading" />;
  }

  if (card == null) {
    return null;
  }

  const target = container && (
    <Anchor
      key="target"
      component={ForwardRefLink}
      to={container.url}
      target="_blank"
      fw="bold"
    >
      {container.name}
    </Anchor>
  );
  const chartName = (
    <Anchor
      key="name"
      component={ForwardRefLink}
      to={Urls.card(card)}
      target="_blank"
      fw="bold"
    >
      {card.name}
    </Anchor>
  );

  return (
    <Flex align="center" gap="sm" c="text-secondary">
      <Icon name="check" size={14} />
      <Text c="text-secondary">
        {target
          ? jt`Chart ${chartName} saved to ${target}`
          : jt`Chart ${chartName} saved`}
      </Text>
    </Flex>
  );
};

const formatPartType = (type: string) => type.replace(/^data-/, "");

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
      bd="1px solid var(--mb-color-border-neutral)"
      bdrs="sm"
      className={Styles.agentPartCard}
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
          <Text fw="bold">{formatPartType(type)}</Text>
        </Flex>
        <ActionIcon
          h="sm"
          onClick={() => clipboard.copy(formatted)}
          className={cx(Styles.agentPartActions, Styles.agentPartActionIcon)}
        >
          <Icon name="copy" size="1rem" />
        </ActionIcon>
      </Flex>
      <Box
        p="sm"
        bg="background_page-primary"
        style={{
          borderTop: "1px solid var(--mb-color-border-neutral)",
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
    direction="row"
    align="center"
    justify="space-between"
    bd="1px solid var(--mb-color-border-neutral)"
    bdrs="sm"
    className={Styles.agentPartCard}
    p="sm"
    pl="md"
  >
    <Flex align="center">
      <Icon name="document" c="text-secondary" mr="sm" />
      <Text fw="bold">{formatPartType(type)}</Text>
    </Flex>
    <ActionIcon
      component={ForwardRefLink}
      to={path}
      target="_blank"
      h="sm"
      aria-label={t`Visit`}
      className={cx(Styles.agentPartActions, Styles.agentPartActionIcon)}
    >
      <Icon name="external" size="1rem" />
    </ActionIcon>
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
      bd="1px solid var(--mb-color-border-neutral)"
      bdrs="sm"
      className={Styles.agentPartCard}
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
          <Text fw="bold">{formatPartType(type)}</Text>
          <Text c="text-secondary">{t`Buffer ID: ${value.buffer_id}`}</Text>
          <Badge color="brand" size="sm" variant="light">
            {getModeLabel(value.mode)}
          </Badge>
        </Flex>
        <ActionIcon
          h="sm"
          onClick={() => clipboard.copy(value.value)}
          className={cx(Styles.agentPartActions, Styles.agentPartActionIcon)}
        >
          <Icon name="copy" size="1rem" />
        </ActionIcon>
      </Flex>
      <Box
        style={{
          borderTop: "1px solid var(--mb-color-border-neutral)",
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

function getModeLabel(mode: MetabotCodeEdit["mode"]): string {
  return match(mode)
    .with("rewrite", () => t`Rewrite`)
    .exhaustive();
}
