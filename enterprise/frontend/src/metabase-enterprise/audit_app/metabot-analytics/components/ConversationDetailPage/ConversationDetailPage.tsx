import { useMemo } from "react";
import type { WithRouterProps } from "react-router";
import { t } from "ttag";

import { GroupSummary } from "metabase/admin/people/components/GroupSummary";
import { getGroupFocusPermissionsUrl } from "metabase/admin/permissions/utils/urls";
import {
  skipToken,
  useGetAdhocQueryMetadataQuery,
  useListPermissionsGroupsQuery,
  useListUserMembershipsQuery,
} from "metabase/api";
import { Breadcrumbs } from "metabase/common/components/Breadcrumbs";
import { CodeEditor } from "metabase/common/components/CodeEditor";
import { DateTime } from "metabase/common/components/DateTime";
import { ForwardRefLink } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { MetabotAdminLayout } from "metabase/metabot/components/MetabotAdmin/MetabotAdminLayout";
import {
  AgentMessage,
  Messages,
} from "metabase/metabot/components/MetabotChat/MetabotChatMessage";
import { getIssueTypeLabel } from "metabase/metabot/components/MetabotChat/feedback-issue-types";
import type {
  MetabotAgentTextChatMessage,
  MetabotChatMessage,
} from "metabase/metabot/state/types";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { getMetadata } from "metabase/selectors/metadata";
import { getSetting } from "metabase/selectors/settings";
import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Icon,
  Loader,
  Menu,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from "metabase/ui";
import { isAdminGroup, isDefaultGroup } from "metabase/utils/groups";
import { useSelector } from "metabase/utils/redux";
import * as Urls from "metabase/utils/urls";
import { getUserName } from "metabase/utils/user";
import { useGetTenantQuery } from "metabase-enterprise/api";
import * as EnterpriseUrls from "metabase-enterprise/urls";
import Question from "metabase-lib/v1/Question";
import { getUrl as ML_getUrl } from "metabase-lib/v1/urls";
import type { DatasetQuery } from "metabase-types/api";

import { useGetMetabotConversationQuery } from "../../api";
import type { ConversationFeedback, GeneratedQuery } from "../../types";

type StatCardProps = {
  label: string;
  value: string;
};

function StatCard({ label, value }: StatCardProps) {
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

export function ConversationDetailPage({ params }: WithRouterProps) {
  const convoId = params.convoId;

  const {
    data: conversation,
    isLoading,
    error,
  } = useGetMetabotConversationQuery(convoId);

  const userGroupsInfo = useUserGroupsInfo(conversation?.user?.id);
  const tenantId = conversation?.user?.tenant_id ?? null;
  const { data: tenant } = useGetTenantQuery(
    PLUGIN_TENANTS.isEnabled && tenantId != null ? tenantId : skipToken,
  );

  if (isLoading || error) {
    return (
      <MetabotAdminLayout>
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </MetabotAdminLayout>
    );
  }

  if (!conversation) {
    return null;
  }

  const userName = conversation.user
    ? getUserName(conversation.user) || t`Unknown`
    : t`Unknown`;
  const totalTokens = conversation.total_tokens ?? 0;
  const messageCount = conversation.message_count ?? 0;
  const searchCount = conversation.search_count ?? 0;
  const queryCount = conversation.query_count ?? 0;
  const firstProfile = conversation.profile_id ?? undefined;
  const queries = conversation.queries ?? [];
  const feedback = conversation.feedback ?? [];

  return (
    <MetabotAdminLayout>
      <Stack gap="2.5rem">
        <Breadcrumbs
          crumbs={[
            [t`Conversations`, "/admin/metabot/usage-auditing/conversations"],
            <>
              {userName}, <DateTime value={conversation.created_at} />
            </>,
          ]}
        />

        <Flex justify="space-between" align="flex-start" gap="md">
          <Stack gap="sm">
            <Flex align="baseline">
              <Title order={2}>{t`Conversation with ${userName}`}</Title>
              {conversation.user && (
                <Tooltip label={t`View user`}>
                  <ActionIcon
                    component={ForwardRefLink}
                    to={Urls.editUser(conversation.user)}
                    variant="subtle"
                    color="text-secondary"
                    aria-label={t`Open user profile`}
                  >
                    <Icon name="external" size={16} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Flex>
            <Flex gap="lg" align="center" wrap="wrap">
              <Flex gap="xs" align="center">
                <Icon name="calendar" size={16} c="text-tertiary" />
                <Text size="md" c="text-secondary">
                  <DateTime value={conversation.created_at} unit="day" />
                </Text>
              </Flex>
              {firstProfile && (
                <Flex gap="xs" align="center">
                  <Icon name="metabot" size={16} c="text-tertiary" />
                  <Text size="md" c="text-secondary">
                    {firstProfile}
                  </Text>
                </Flex>
              )}
              {userGroupsInfo.userGroups.length > 0 && (
                <Flex gap="xs" align="center">
                  <Icon name="group" size={16} c="text-tertiary" />
                  <UserGroupsMenu {...userGroupsInfo} />
                </Flex>
              )}
              {tenant && (
                <Flex gap="xs" align="center">
                  <Icon name="globe" size={16} c="text-tertiary" />
                  <Anchor
                    component={ForwardRefLink}
                    to={EnterpriseUrls.editTenant(tenant.id)}
                    c="text-secondary"
                    size="md"
                    underline="hover"
                  >
                    {tenant.name}
                  </Anchor>
                </Flex>
              )}
              {conversation.slack_permalink && (
                <Anchor
                  href={conversation.slack_permalink}
                  target="_blank"
                  rel="noreferrer"
                  size="md"
                >
                  {t`Open in Slack`}
                </Anchor>
              )}
            </Flex>
          </Stack>
        </Flex>

        <SimpleGrid cols={4}>
          <StatCard label={t`Messages`} value={String(messageCount)} />
          <StatCard
            label={t`Total tokens`}
            value={totalTokens.toLocaleString()}
          />
          <StatCard label={t`Queries run`} value={String(queryCount)} />
          <StatCard label={t`Searches`} value={String(searchCount)} />
        </SimpleGrid>

        {feedback.length > 0 && (
          <Stack gap="md">
            <Title order={3}>{t`Feedback`}</Title>
            <Stack gap="sm">
              {feedback.map((item) => (
                <FeedbackCard
                  key={item.message_id}
                  feedback={item}
                  chatMessages={conversation.chat_messages ?? []}
                />
              ))}
            </Stack>
          </Stack>
        )}

        <Stack gap="md">
          <Title order={3}>{t`Conversation`}</Title>
          <Card withBorder shadow="none" p="xl">
            <Messages
              messages={conversation.chat_messages ?? []}
              errorMessages={[]}
              isDoingScience={false}
            />
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

function FeedbackCard({
  feedback,
  chatMessages,
}: {
  feedback: ConversationFeedback;
  chatMessages: MetabotChatMessage[];
}) {
  const agentResponse = useMemo(
    () =>
      feedback.external_id
        ? (chatMessages.find(
            (m) =>
              m.role === "agent" &&
              m.type === "text" &&
              m.externalId === feedback.external_id,
          ) as MetabotAgentTextChatMessage | undefined)
        : undefined,
    [feedback.external_id, chatMessages],
  );

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
        {agentResponse && (
          <AgentMessage
            message={agentResponse}
            hideActions
            onCopy={noopCopy}
            showFeedbackButtons={false}
            submittedFeedback={undefined}
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

function GeneratedQueryCard({ query }: { query: GeneratedQuery }) {
  if (query.query_type === "notebook" && query.mbql) {
    return <NotebookGeneratedQueryCard mbql={query.mbql} />;
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
          <Text size="lg" fw={700}>{t`SQL query`}</Text>
          {runUrl && <RunButton url={runUrl} />}
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

function RunButton({ url }: { url: string }) {
  return (
    <Button
      component="a"
      href={url}
      target="_blank"
      rel="noreferrer"
      variant="filled"
      leftSection={<Icon name="play_outlined" aria-hidden />}
    >
      {t`Run`}
    </Button>
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
          <Text size="lg" fw={700}>
            {title}
          </Text>
          <RunButton url={runUrl} />
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

function noopCopy() {}

function useUserGroupsInfo(userId: number | undefined) {
  const { data: membershipsByUser } = useListUserMembershipsQuery();
  const { data: groups } = useListPermissionsGroupsQuery({});

  return useMemo(() => {
    if (userId == null || !membershipsByUser || !groups) {
      return { allGroups: [], userGroups: [], selectedGroupIds: [] };
    }
    const memberships = membershipsByUser[userId] ?? [];
    const selectedGroupIds = memberships.map((m) => m.group_id);
    const userGroups = groups
      .filter((g) => selectedGroupIds.includes(g.id) && !isDefaultGroup(g))
      // admin first, rest in the API's stable order
      .sort((a, b) => Number(isAdminGroup(b)) - Number(isAdminGroup(a)));
    return { allGroups: groups, userGroups, selectedGroupIds };
  }, [userId, membershipsByUser, groups]);
}

function UserGroupsMenu({
  allGroups,
  userGroups,
  selectedGroupIds,
}: ReturnType<typeof useUserGroupsInfo>) {
  if (userGroups.length === 0) {
    return null;
  }

  return (
    <Menu shadow="md" position="bottom-start" withinPortal>
      <Menu.Target>
        <Anchor
          component="button"
          type="button"
          underline="never"
          c="text-secondary"
          size="md"
          fw="normal"
        >
          <Flex component="span" align="center" gap={4}>
            <GroupSummary
              groups={allGroups}
              selectedGroupIds={selectedGroupIds}
            />
            <Icon name="chevrondown" size={10} c="text-tertiary" />
          </Flex>
        </Anchor>
      </Menu.Target>
      <Menu.Dropdown miw="14rem">
        <Menu.Label>{t`Groups`}</Menu.Label>
        {userGroups.map((group) => (
          <Menu.Item
            key={group.id}
            component={ForwardRefLink}
            to={getGroupFocusPermissionsUrl(group.id)}
            leftSection={<Icon name="group" size={14} />}
          >
            {group.name}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
