import { t } from "ttag";

import { Messages } from "metabase/metabot/components/MetabotChat/MetabotChatMessage";
import type { MetabotMessage } from "metabase/metabot/state/types";
import {
  Badge,
  Box,
  Code,
  Group,
  Paper,
  Stack,
  Text,
  Title,
} from "metabase/ui";

import { AGENT_NUMBERS as N } from "./agent-numbers";

type ToolStep = { id: string; title: string; status: "ended" | "errored" };

const userMessage = (id: string, message: string): MetabotMessage => ({
  id,
  role: "user",
  status: { type: "done" },
  parts: [{ id: `${id}-text`, role: "user", type: "text", message }],
});

const agentMessage = (
  id: string,
  steps: ToolStep[],
  message: string,
): MetabotMessage => ({
  id,
  role: "agent",
  status: { type: "done" },
  parts: [
    {
      id: `${id}-thinking`,
      role: "agent",
      type: "chain_of_thought",
      finished: true,
      steps: steps.map((step) => ({ kind: "tool", name: "tool", ...step })),
    },
    { id: `${id}-text`, role: "agent", type: "text", message },
  ],
});

const money = (value: number) => `$${value.toLocaleString()}`;

const WORKER_SCHEMA = `table worker_position_history
  position_record_id  integer  PK
  worker_id           text
  department          text
  effective_date      date
  end_date            date
  is_current          boolean`;

const SUBSCRIPTION_SCHEMA = `table subscription_history
  id          integer    PK
  updated_at  timestamp  PK
  plan        text
  seats       integer`;

const WORKER_METADATA = `history:
  durable_key: worker_id
  valid_from: effective_date
  valid_to: end_date
  current_flag: null
  version: position_version
scd_type: 2
default_scope: { segment: current_rows }
data_notes:
  - ${N.workerCount - N.currentWorkerCount} workers have no current record.`;

const SUBSCRIPTION_METADATA = `history:
  durable_key: id
  valid_from: updated_at
  valid_to: null
  current_flag: null
  version: updated_at
scd_type: 2
current_rule: proposed, not confirmed
data_notes:
  - 1 subscription has two latest rows with the same time.`;

type Scenario = {
  id: string;
  title: string;
  question: string;
  without: { steps: ToolStep[]; answer: string; verdict: string };
  with: { steps: ToolStep[]; answer: string; verdict: string };
  schema: string;
  metadata: string;
};

function getScenarios(): Scenario[] {
  return [
    {
      id: "count",
      title: t`Counting workers`,
      question: "How many workers do we have?",
      without: {
        steps: [
          { id: "1", title: "Read worker_position_history", status: "ended" },
          { id: "2", title: "Ran SQL: SELECT count(*)", status: "ended" },
        ],
        answer: `We have **${N.recordCount.toLocaleString()} workers**.`,
        verdict: t`Counts records, so every version of a worker counts again.`,
      },
      with: {
        steps: [
          {
            id: "1",
            title: "Read the history metadata of worker_position_history",
            status: "ended",
          },
          {
            id: "2",
            title: "Ran SQL: count(DISTINCT worker_id) where end_date is null",
            status: "ended",
          },
        ],
        answer: `**${N.currentWorkerCount} workers** today.

${N.workerCount} workers have a record here; ${N.workerCount - N.currentWorkerCount} of them have no current record, probably because they left.`,
        verdict: t`Counts distinct workers and applies the current-row rule.`,
      },
      schema: WORKER_SCHEMA,
      metadata: `${WORKER_SCHEMA}

${WORKER_METADATA}`,
    },
    {
      id: "filter",
      title: t`Applying the current filter`,
      question: `How many people work in ${N.department}?`,
      without: {
        steps: [
          {
            id: "1",
            title: "Ran SQL: count(*) where department = 'Engineering'",
            status: "ended",
          },
        ],
        answer: `**${N.departmentRecordCount}** people work in ${N.department}.`,
        verdict: t`Counts every version, including people who moved out of Engineering years ago.`,
      },
      with: {
        steps: [
          {
            id: "1",
            title:
              "Ran SQL: count(DISTINCT worker_id) where department = 'Engineering' and end_date is null",
            status: "ended",
          },
        ],
        answer: `**${N.departmentCurrentCount}** people work in ${N.department} today.`,
        verdict: t`Only current versions, one per worker.`,
      },
      schema: WORKER_SCHEMA,
      metadata: `${WORKER_SCHEMA}

${WORKER_METADATA}`,
    },
    {
      id: "join",
      title: t`Adding department to event tables`,
      question:
        "Add the worker's department to time off requests and expense reports, and give me Engineering's totals.",
      without: {
        steps: [
          {
            id: "1",
            title: "Joined time_off_requests on worker_id",
            status: "ended",
          },
          {
            id: "2",
            title: "Joined expense_reports on worker_id",
            status: "ended",
          },
        ],
        answer: `Engineering took **${N.timeOffDaysInDepartmentFannedOut.toLocaleString()} days** off and spent **${money(N.expenseInDepartmentFannedOut)}**.`,
        verdict: t`Joining on worker_id matches every version of a worker, so anyone who was ever in Engineering counts once per Engineering version. The real time off is ${N.timeOffDaysInDepartment.toLocaleString()} days.`,
      },
      with: {
        steps: [
          {
            id: "1",
            title:
              "time_off_requests has position_record_id: joined that version directly",
            status: "ended",
          },
          {
            id: "2",
            title: "expense_reports only has worker_id: needs a date",
            status: "ended",
          },
        ],
        answer: `**Time off:** Engineering took **${N.timeOffDaysInDepartment.toLocaleString()} days**. Each request already points at the position record it was filed under, so I used that department.

**Expenses:** these only have a worker ID, so which department do you mean?
- Department **when the expense was submitted**: ${money(N.expenseInDepartmentThen)}
- Worker's department **today**: ${money(N.expenseInDepartmentNow)}

I'll use the department at submission unless you say otherwise.`,
        verdict: t`Keeps the version the warehouse already recorded, and asks about the date only where it has to.`,
      },
      schema: WORKER_SCHEMA,
      metadata: `${WORKER_SCHEMA}

${WORKER_METADATA}`,
    },
    {
      id: "uncertain",
      title: t`An unconfirmed rule`,
      question: `How many subscriptions are on ${N.plan}?`,
      without: {
        steps: [
          {
            id: "1",
            title: "Ran SQL: count(*) where plan = 'Business'",
            status: "ended",
          },
        ],
        answer: `**${N.planRecordCount}** subscriptions are on ${N.plan}.`,
        verdict: t`Counts every change to a subscription.`,
      },
      with: {
        steps: [
          {
            id: "1",
            title: "Read the history metadata of subscription_history",
            status: "ended",
          },
          {
            id: "2",
            title:
              "Ran SQL: latest row per id, then count where plan = 'Business'",
            status: "ended",
          },
        ],
        answer: `About **${N.planLatestCount}** subscriptions are on ${N.plan}.

This table keeps one row per change, and nobody has confirmed which row is current. I used the latest row per subscription. One subscription has two latest rows with the same time, so the number could be off by one.`,
        verdict: t`Recognizes the history, uses the proposed rule, and says it isn't confirmed.`,
      },
      schema: SUBSCRIPTION_SCHEMA,
      metadata: `${SUBSCRIPTION_SCHEMA}

${SUBSCRIPTION_METADATA}`,
    },
  ];
}

function Conversation({
  badge,
  badgeColor,
  messages,
  verdict,
  schema,
  conversationId,
}: {
  badge: string;
  badgeColor: "neutral" | "brand";
  messages: MetabotMessage[];
  verdict: string;
  schema: string;
  conversationId: string;
}) {
  return (
    <Paper withBorder radius="lg" p="lg" flex={1} miw={0}>
      <Stack gap="md">
        <Badge color={badgeColor} variant="light" w="fit-content">
          {badge}
        </Badge>
        <Box>
          <Messages
            messages={messages}
            isDoingScience={false}
            debug={false}
            readonly
            conversationId={conversationId}
            size="md"
          />
        </Box>
        <Text size="sm" fw="bold">
          {verdict}
        </Text>
        <Stack gap="xs">
          <Text size="sm" fw="bold" c="text-secondary">
            {t`What the agent reads`}
          </Text>
          <Code block>{schema}</Code>
        </Stack>
      </Stack>
    </Paper>
  );
}

export function AgentComparisonPrototype() {
  return (
    <Stack p="xl" gap="xxl" bg="background_page-secondary" mih="100vh">
      <Stack gap="xs">
        <Title
          order={2}
        >{t`Agents with and without the history metadata`}</Title>
        <Text c="text-secondary">
          {t`The same questions to Metabot or MB-Code. The only difference is what the agent reads about the tables.`}
        </Text>
      </Stack>
      {getScenarios().map((scenario) => (
        <Stack key={scenario.id} gap="md">
          <Group gap="sm">
            <Title order={4}>{scenario.title}</Title>
          </Group>
          <Group align="stretch" gap="xl" wrap="nowrap">
            <Conversation
              badge={t`Without history metadata`}
              badgeColor="neutral"
              conversationId={`${scenario.id}-without`}
              messages={[
                userMessage(`${scenario.id}-q1`, scenario.question),
                agentMessage(
                  `${scenario.id}-a1`,
                  scenario.without.steps,
                  scenario.without.answer,
                ),
              ]}
              verdict={scenario.without.verdict}
              schema={scenario.schema}
            />
            <Conversation
              badge={t`With history metadata`}
              badgeColor="brand"
              conversationId={`${scenario.id}-with`}
              messages={[
                userMessage(`${scenario.id}-q2`, scenario.question),
                agentMessage(
                  `${scenario.id}-a2`,
                  scenario.with.steps,
                  scenario.with.answer,
                ),
              ]}
              verdict={scenario.with.verdict}
              schema={scenario.metadata}
            />
          </Group>
        </Stack>
      ))}
    </Stack>
  );
}
