import { useMemo } from "react";
import type { WithRouterProps } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { skipToken, useGetAdhocQueryMetadataQuery } from "metabase/api";
import { CodeEditor } from "metabase/common/components/CodeEditor";
import { DateTime } from "metabase/common/components/DateTime";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Messages } from "metabase/metabot/components/MetabotChat/MetabotChatMessage";
import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { getMetadata } from "metabase/selectors/metadata";
import { getSetting } from "metabase/selectors/settings";
import {
  Anchor,
  Badge,
  Card,
  Flex,
  Icon,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import { useDispatch, useSelector } from "metabase/utils/redux";
import { getUserName } from "metabase/utils/user";
import Question from "metabase-lib/v1/Question";
import type { DatasetQuery } from "metabase-types/api";

import { useGetMetabotConversationQuery } from "../../api";
import type { GeneratedQuery } from "../../types";

type StatCardProps = {
  label: string;
  value: string;
};

function StatCard({ label, value }: StatCardProps) {
  return (
    <Card withBorder p="md">
      <Text size="sm" c="text-secondary">
        {label}
      </Text>
      <Title order={2} mt="xs">
        {value}
      </Title>
    </Card>
  );
}

export function ConversationDetailPage({ params }: WithRouterProps) {
  const convoId = params.convoId;
  const dispatch = useDispatch();

  const {
    data: conversation,
    isLoading,
    error,
  } = useGetMetabotConversationQuery(convoId);

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (!conversation) {
    return null;
  }

  const userName = conversation.user
    ? getUserName(conversation.user) || t`Unknown`
    : t`Unknown`;
  const totalTokens = conversation.total_tokens ?? 0;
  const messageCount = conversation.message_count ?? 0;
  const firstModel = conversation.model ?? undefined;
  const queries = conversation.queries ?? [];

  return (
    <>
      <Anchor
        size="sm"
        mt="md"
        onClick={() =>
          dispatch(push("/admin/metabot/usage-auditing/conversations"))
        }
        style={{ cursor: "pointer" }}
      >
        <Flex align="center" gap={4}>
          <Icon name="chevronleft" size={12} />
          {t`Back to conversations`}
        </Flex>
      </Anchor>

      <Flex justify="space-between" align="flex-start" mt="md">
        <div>
          <Title order={2}>{t`Conversation with ${userName}`}</Title>
          <Flex gap="sm" mt="xs" align="center">
            {firstModel && (
              <Badge size="sm" variant="light">
                {firstModel}
              </Badge>
            )}
            <Text size="sm" c="text-secondary">
              <DateTime value={conversation.created_at} unit="day" />
            </Text>
            {conversation.slack_permalink && (
              <Anchor
                href={conversation.slack_permalink}
                target="_blank"
                rel="noreferrer"
                size="sm"
              >
                {t`Open in Slack`}
              </Anchor>
            )}
          </Flex>
        </div>
      </Flex>

      <SimpleGrid cols={3} mt="lg">
        <StatCard
          label={t`Total tokens`}
          value={totalTokens.toLocaleString()}
        />
        <StatCard label={t`Queries run`} value="—" />
        <StatCard label={t`Messages`} value={String(messageCount)} />
      </SimpleGrid>

      <Title order={3} mt="xl">{t`Conversation`}</Title>
      <Card withBorder p="xl" mt="sm">
        <Messages
          messages={conversation.chat_messages ?? []}
          errorMessages={[]}
          isDoingScience={false}
        />
      </Card>

      <Title order={3} mt="xl">{t`Queries generated`}</Title>
      {queries.length === 0 ? (
        <Card withBorder p="xl" mt="sm">
          <Flex justify="center" align="center" mih={120} c="text-tertiary">
            <Text size="lg">{t`No queries generated`}</Text>
          </Flex>
        </Card>
      ) : (
        <Stack mt="sm" gap="md">
          {queries.map((query) => (
            <GeneratedQueryCard
              key={query.call_id ?? `${query.message_id}-${query.query_id}`}
              query={query}
            />
          ))}
        </Stack>
      )}
    </>
  );
}

function GeneratedQueryCard({ query }: { query: GeneratedQuery }) {
  if (query.query_type === "notebook" && query.mbql) {
    return <NotebookGeneratedQueryCard mbql={query.mbql} />;
  }
  return <SqlGeneratedQueryCard query={query} />;
}

function SqlGeneratedQueryCard({ query }: { query: GeneratedQuery }) {
  return (
    <Card withBorder p="md">
      <CodeEditor value={query.sql ?? ""} language="sql" readOnly />
      {query.tables.length > 0 && (
        <Text size="sm" mt="sm" c="text-secondary">
          <Text span fw={700}>{t`Tables: `}</Text>
          {query.tables.join(", ")}
        </Text>
      )}
    </Card>
  );
}

// Gate the Notebook mount on metadata loading: DataStep's local `isOpened`
// state is initialized once at mount from `!table`, so if we render before the
// source table resolves the data picker pops open and never closes itself
// (see frontend/src/metabase/querying/notebook/components/DataStep/DataStep.tsx).
function NotebookGeneratedQueryCard({ mbql }: { mbql: DatasetQuery }) {
  const { isLoading, isError } = useGetAdhocQueryMetadataQuery(
    mbql.database != null ? mbql : skipToken,
  );
  const metadata = useSelector(getMetadata);
  const reportTimezone = useSelector((state) =>
    getSetting(state, "report-timezone-long"),
  );

  const question = useMemo(
    () =>
      new Question(
        {
          name: null,
          display: "table",
          visualization_settings: {},
          dataset_query: mbql,
        },
        metadata,
      ).setType("question"),
    [mbql, metadata],
  );

  if (isLoading) {
    return (
      <Card withBorder p="md">
        <Flex justify="center" align="center" mih={120}>
          <Loader />
        </Flex>
      </Card>
    );
  }

  if (isError || mbql.database == null) {
    return (
      <Card withBorder p="md">
        <CodeEditor
          value={JSON.stringify(mbql, null, 2)}
          language="json"
          readOnly
        />
      </Card>
    );
  }

  return (
    <Card withBorder p={0} style={{ overflowX: "auto" }}>
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
    </Card>
  );
}

function noopUpdateQuestion(): Promise<void> {
  return Promise.resolve();
}
