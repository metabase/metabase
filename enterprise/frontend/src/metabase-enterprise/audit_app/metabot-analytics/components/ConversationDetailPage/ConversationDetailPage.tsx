import type { WithRouterProps } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import { getUserName } from "metabase/lib/user";
import { Messages } from "metabase/metabot/components/MetabotChat/MetabotChatMessage";
import {
  Anchor,
  Badge,
  Card,
  Flex,
  Icon,
  SimpleGrid,
  Text,
  Title,
} from "metabase/ui";

import { useGetMetabotConversationQuery } from "../../api";

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
  const totalTokens = conversation.messages.reduce(
    (sum, msg) => sum + (msg.total_tokens ?? 0),
    0,
  );
  const messageCount = conversation.messages.length;
  const firstModel = conversation.messages.find(
    (m) => m.role === "assistant" && m.model,
  )?.model;

  return (
    <>
      <Anchor
        size="sm"
        mt="md"
        onClick={() =>
          dispatch(push("/admin/metabot/usage-stats/conversations"))
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
          </Flex>
        </div>
      </Flex>

      <SimpleGrid cols={4} mt="lg">
        <StatCard
          label={t`Total tokens`}
          value={totalTokens.toLocaleString()}
        />
        <StatCard
          label={t`Cost`}
          value={`$${(totalTokens * 0.0001).toFixed(2)}`}
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
      <Card withBorder p="xl" mt="sm">
        <Flex justify="center" align="center" mih={120} c="text-tertiary">
          <Text size="lg">{t`TODO: queries`}</Text>
        </Flex>
      </Card>
    </>
  );
}
