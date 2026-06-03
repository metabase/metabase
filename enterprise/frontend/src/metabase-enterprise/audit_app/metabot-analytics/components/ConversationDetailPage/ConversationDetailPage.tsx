import { useEffect, useMemo } from "react";
import type { WithRouterProps } from "react-router";
import { t } from "ttag";

import { MetabotAdminLayout } from "metabase/admin/ai/MetabotAdminLayout";
import { skipToken, useGetAdhocQueryMetadataQuery } from "metabase/api";
import { CodeEditor } from "metabase/common/components/CodeEditor";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  AgentMessage,
  Messages,
} from "metabase/metabot/components/MetabotChat/MetabotChatMessage";
import {
  type DataPointMentionTarget,
  getDataPointTargetsFromState,
} from "metabase/metabot/components/MetabotChat/data-point-mentions";
import { getIssueTypeLabel } from "metabase/metabot/components/MetabotChat/feedback-issue-types";
import {
  destroyAgent,
  getActiveMetabotAgentIds,
  hydrateChatConversation,
} from "metabase/metabot/state";
import type {
  MetabotAgentId,
  MetabotAgentTextChatMessage,
  MetabotChatMessage,
} from "metabase/metabot/state/types";
import { normalizeFetchedChatMessages } from "metabase/metabot/utils/normalize-fetched-chat-messages";
import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { useDispatch, useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { getSetting } from "metabase/selectors/settings";
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Icon,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import { question as ML_getUrl } from "metabase/urls/questions";
import { formatNumber } from "metabase/utils/formatting";
import { getUserName } from "metabase/utils/user";
import Question from "metabase-lib/v1/Question";
import type { DatasetQuery, VisualizationDisplay } from "metabase-types/api";

import { useGetMetabotConversationQuery } from "../../api";
import type { ConversationFeedback, GeneratedQuery } from "../../types";
import { ConversationTrace } from "../ConversationTrace/ConversationTrace";

import { ConversationHeader } from "./ConversationHeader";

export function ConversationDetailPage({ params }: WithRouterProps) {
  const convoId = params.convoId;
  const dispatch = useDispatch();
  const activeAgentIds = useSelector(getActiveMetabotAgentIds);

  const {
    data: conversation,
    isLoading,
    error,
  } = useGetMetabotConversationQuery(convoId, {
    refetchOnMountOrArgChange: true,
  });

  const isSlack =
    conversation?.profile_id === "slackbot" ||
    conversation?.profile_id === "slack";

  const chatMessages = useMemo(() => {
    return normalizeFetchedChatMessages(conversation?.chat_messages ?? [], {
      isSlack,
    });
  }, [conversation, isSlack]);

  // Synthesized for read-only analytics rendering.
  const agentId: MetabotAgentId | null = conversation
    ? `chat_${conversation.conversation_id}`
    : null;
  const agentExists = !!agentId && activeAgentIds.includes(agentId);

  // The read-only chat components read Metabot selectors keyed by `agentId`,
  // which throw when no conversation is registered. Hydrate a snapshot into the
  // Metabot store (mirroring MetabotPage) so those selectors resolve; the empty
  // history/state keep the rendering inert. Torn down on unmount.
  useEffect(() => {
    if (!agentId || !conversation || agentExists) {
      return;
    }
    dispatch(
      hydrateChatConversation({
        agentId,
        conversationId: conversation.conversation_id,
        title: null,
        messages: chatMessages,
        history: [],
        state: {},
      }),
    );
  }, [dispatch, agentId, agentExists, conversation, chatMessages]);

  useEffect(() => {
    return () => {
      if (agentId) {
        dispatch(destroyAgent({ agentId }));
      }
    };
  }, [dispatch, agentId]);

  if (isLoading || error) {
    return (
      <MetabotAdminLayout>
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </MetabotAdminLayout>
    );
  }

  if (!conversation || !agentId) {
    return null;
  }

  const {
    total_tokens,
    message_count,
    search_count,
    query_count,
    queries,
    feedback,
    spans,
  } = conversation;

  const dataPointTargets = getDataPointTargetsFromState(conversation.state);

  return (
    <MetabotAdminLayout>
      <Stack gap="2.5rem">
        <ConversationHeader conversation={conversation} />

        <SimpleGrid cols={4}>
          <StatCard label={t`Messages`} value={formatNumber(message_count)} />
          <StatCard
            label={t`Total tokens`}
            value={formatNumber(total_tokens)}
          />
          <StatCard label={t`Queries run`} value={formatNumber(query_count)} />
          <StatCard label={t`Searches`} value={formatNumber(search_count)} />
        </SimpleGrid>

        {agentExists && feedback.length > 0 && (
          <Stack gap="md">
            <Title order={3}>{t`Feedback`}</Title>
            <Stack gap="sm">
              {feedback.map((item) => (
                <FeedbackCard
                  key={item.id}
                  agentId={agentId}
                  feedback={item}
                  chatMessages={chatMessages}
                  dataPointTargets={dataPointTargets}
                />
              ))}
            </Stack>
          </Stack>
        )}

        {spans.length > 0 && <ConversationTrace spans={spans} />}

        <Stack gap="md">
          <Flex align="baseline" justify="space-between">
            <Title order={3}>{t`Conversation`}</Title>
            {conversation.slack_permalink && (
              <ExternalLink href={conversation.slack_permalink}>
                {t`Open in Slack`}
              </ExternalLink>
            )}
          </Flex>
          <Card withBorder shadow="none" p="xl">
            {agentExists ? (
              <Messages
                agentId={agentId}
                messages={chatMessages}
                isDoingScience={false}
                debug
                readonly
                dataPointTargets={dataPointTargets}
              />
            ) : (
              <Flex justify="center" align="center" mih={120}>
                <Loader />
              </Flex>
            )}
          </Card>
        </Stack>

        {queries.length > 0 && (
          <Stack gap="md">
            <Title order={3}>{t`Queries generated`}</Title>
            {queries.map((query) => (
              <GeneratedQueryCard
                key={query.call_id ?? `${query.message_id}-${query.query_id}`}
                query={query}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </MetabotAdminLayout>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card withBorder shadow="none" p="md">
      <Text size="sm" c="text-secondary">
        {label}
      </Text>
      <Title order={2} mt="xs">
        {value}
      </Title>
    </Card>
  );
}

function FeedbackCard({
  agentId,
  feedback,
  chatMessages,
  dataPointTargets,
}: {
  agentId: MetabotAgentId;
  feedback: ConversationFeedback;
  chatMessages: MetabotChatMessage[];
  dataPointTargets?: Record<string, DataPointMentionTarget | undefined>;
}) {
  const agentResponse = useMemo(
    () =>
      feedback.external_id
        ? chatMessages.find(
            (m): m is MetabotAgentTextChatMessage =>
              m.role === "agent" &&
              m.type === "text" &&
              m.externalId === feedback.external_id,
          )
        : undefined,
    [feedback.external_id, chatMessages],
  );

  const submitterName = feedback.user
    ? getUserName(feedback.user) || null
    : null;

  return (
    <Card withBorder shadow="none" p="md">
      <Stack gap="sm">
        <Flex gap="xs" align="center">
          <Icon
            name={feedback.positive ? "thumbs_up" : "thumbs_down"}
            size={20}
            c="text-secondary"
          />
          <Text fw={700}>{feedback.positive ? t`Positive` : t`Negative`}</Text>
          {!feedback.positive && feedback.issue_type && (
            <Badge variant="light" bg="background-error" c="error" ml="xs">
              {getIssueTypeLabel(feedback.issue_type)}
            </Badge>
          )}
        </Flex>
        {submitterName && (
          <Text size="sm" c="text-secondary">
            {t`Submitted by ${submitterName}`}
          </Text>
        )}
        {agentResponse && (
          <AgentMessage
            agentId={agentId}
            message={agentResponse}
            debug
            readonly
            hideActions
            getCopyText={noopGetCopyText}
            submittedFeedback={undefined}
            dataPointTargets={dataPointTargets}
            bg="background-secondary"
            p="md"
            pb="0"
            bd="1px solid var(--mb-color-border)"
            bdrs="1rem"
          />
        )}
        {feedback.freeform_feedback && (
          <Text>{feedback.freeform_feedback}</Text>
        )}
      </Stack>
    </Card>
  );
}

export function GeneratedQueryCard({ query }: { query: GeneratedQuery }) {
  if (query.query_type === "notebook" && query.mbql) {
    return (
      <NotebookGeneratedQueryCard mbql={query.mbql} display={query.display} />
    );
  }
  return <SqlGeneratedQueryCard query={query} />;
}

function SqlGeneratedQueryCard({ query }: { query: GeneratedQuery }) {
  const metadata = useSelector(getMetadata);

  const runUrl = useMemo(() => {
    if (query.database_id == null || !query.sql) {
      return null;
    }
    const datasetQuery: DatasetQuery = {
      type: "native",
      database: query.database_id,
      native: { query: query.sql, "template-tags": {} },
    };
    const question = new Question(
      {
        name: null,
        display: "table",
        visualization_settings: {},
        dataset_query: datasetQuery,
      },
      metadata,
    ).setType("question");
    return ML_getUrl(question);
  }, [metadata, query.database_id, query.sql]);

  return (
    <Card withBorder shadow="none" p="md">
      <Stack gap="sm">
        <Flex justify="space-between" align="center" gap="sm">
          <Text
            size="lg"
            fw={700}
            style={{ flex: "1 1 auto", minWidth: 0, overflowWrap: "anywhere" }}
          >
            {t`SQL query`}
          </Text>
          {runUrl && (
            <Button
              component="a"
              href={runUrl}
              target="_blank"
              rel="noreferrer"
              variant="filled"
              leftSection={<Icon name="play_outlined" aria-hidden />}
              style={{ flexShrink: 0 }}
            >
              {t`Run`}
            </Button>
          )}
        </Flex>
        <CodeEditor value={query.sql ?? ""} language="sql" readOnly />
        {query.tables.length > 0 && (
          <Text size="sm" c="text-secondary">
            <Text span fw={700}>{t`Tables: `}</Text>
            {query.tables.join(", ")}
          </Text>
        )}
      </Stack>
    </Card>
  );
}

// Gate the Notebook mount on metadata loading: DataStep's local `isOpened`
// state is initialized once at mount from `!table`, so if we render before the
// source table resolves the data picker pops open and never closes itself
// (see frontend/src/metabase/querying/notebook/components/DataStep/DataStep.tsx).
function NotebookGeneratedQueryCard({
  mbql,
  display,
}: {
  mbql: DatasetQuery;
  display: VisualizationDisplay | null;
}) {
  const { isLoading, isError } = useGetAdhocQueryMetadataQuery(
    mbql.database != null ? mbql : skipToken,
  );
  const metadata = useSelector(getMetadata);
  const reportTimezone = useSelector((state) =>
    getSetting(state, "report-timezone-long"),
  );

  const question = useMemo(() => {
    const q = new Question(
      {
        name: null,
        display: display ?? "table",
        visualization_settings: {},
        dataset_query: mbql,
      },
      metadata,
    ).setType("question");
    return display ? q.lockDisplay() : q;
  }, [mbql, metadata, display]);

  if (isLoading) {
    return (
      <Card withBorder shadow="none" p="md">
        <Flex justify="center" align="center" mih={120}>
          <Loader />
        </Flex>
      </Card>
    );
  }

  if (isError || mbql.database == null) {
    return (
      <Card withBorder shadow="none" p="md">
        <CodeEditor
          value={JSON.stringify(mbql, null, 2)}
          language="json"
          readOnly
        />
      </Card>
    );
  }

  const title = question.generateQueryDescription() || t`Notebook query`;
  const runUrl = ML_getUrl(question);

  return (
    <Card
      withBorder
      shadow="none"
      p={{ base: "md", sm: "xl" }}
      pb="sm"
      style={{ overflowX: "auto" }}
    >
      <Stack gap="md">
        <Flex justify="space-between" align="center" gap="sm">
          <Text
            size="lg"
            fw={700}
            style={{ flex: "1 1 auto", minWidth: 0, overflowWrap: "anywhere" }}
          >
            {title}
          </Text>
          <Button
            component="a"
            href={runUrl}
            target="_blank"
            rel="noreferrer"
            variant="filled"
            leftSection={<Icon name="play_outlined" aria-hidden />}
            style={{ flexShrink: 0 }}
          >
            {t`Run`}
          </Button>
        </Flex>
        <Box mx={{ base: "-md", sm: "-xl" }} my={{ base: "-md", sm: "-xl" }}>
          <Notebook
            question={question}
            isDirty={false}
            isRunnable={false}
            isResultDirty={false}
            reportTimezone={reportTimezone}
            hasVisualizeButton={false}
            updateQuestion={noopUpdateQuestion}
            readOnly
          />
        </Box>
      </Stack>
    </Card>
  );
}

function noopUpdateQuestion(): Promise<void> {
  return Promise.resolve();
}

function noopGetCopyText() {
  return "";
}
