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

const QUESTION = "How many Pro customers in EMEA have more than 50 seats?";

const userMessage = (id: string, message: string): MetabotMessage => ({
  id,
  role: "user",
  status: { type: "done" },
  parts: [{ id: `${id}-text`, role: "user", type: "text", message }],
});

type ToolStep = {
  id: string;
  title: string;
  status: "ended" | "errored";
};

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
      steps: steps.map((step) => ({
        kind: "tool",
        name: "tool",
        ...step,
      })),
    },
    { id: `${id}-text`, role: "agent", type: "text", message },
  ],
});

const TODAY_MESSAGES: MetabotMessage[] = [
  userMessage("today-question", QUESTION),
  agentMessage(
    "today-answer",
    [
      { id: "1", title: "Searched for “pro customers seats”", status: "ended" },
      { id: "2", title: "Read Custom field values", status: "ended" },
      {
        id: "3",
        title: "Ran SQL: CAST(property_value AS INT) > 50",
        status: "errored",
      },
      {
        id: "4",
        title: "Ran SQL: property_value > '50'",
        status: "ended",
      },
    ],
    `There are **97** Pro customers in EMEA with more than 50 seats.

Casting seat counts to numbers failed on the value \`10+\`, so I compared them as text instead.`,
  ),
];

const REGISTRY_MESSAGES: MetabotMessage[] = [
  userMessage("registry-question", QUESTION),
  agentMessage(
    "registry-answer",
    [
      {
        id: "1",
        title: "Searched for “pro customers seats”",
        status: "ended",
      },
      {
        id: "2",
        title: "Read Customers and its 14 custom properties",
        status: "ended",
      },
      {
        id: "3",
        title: "Queried Customers: Plan is Pro, Region is EMEA, Seats > 50",
        status: "ended",
      },
    ],
    `**41 customers.** That's 11% of Pro customers.

| Seats | Customers |
| --- | ---: |
| 51–100 | 22 |
| 101–200 | 15 |
| 201–300 | 4 |

For 6 EMEA Pro customers, Seats is missing or isn't a number (like \`10+\`), so they aren't counted. I also counted customers whose plan is stored under **Plan Tier**, which is merged into Plan.`,
  ),
];

const DISCOVERY_MESSAGES: MetabotMessage[] = [
  userMessage("discovery-question", "What do we know about our customers?"),
  agentMessage(
    "discovery-answer",
    [
      { id: "1", title: "Read Customers", status: "ended" },
      { id: "2", title: "Listed custom properties", status: "ended" },
    ],
    `Besides name, email, country and signup date, there are **14 custom properties**:

- **Commercial**: Plan (98% of customers), MRR (69%), Seats (71%), Trial ends (12%)
- **Firmographic**: Region (93%), Industry (64%), Signup source (78%)
- **Ownership**: CSM (41%), Lifecycle stage (91%)
- **New this week**: Churn risk, on 4% of customers. It has no description yet, so check with the data team before relying on it.

Want a breakdown of customers by plan and region?`,
  ),
];

const TODAY_CONTEXT = `table custom_field_value
  customer_id      integer  FK → customers.id
  custom_field_id  integer  FK → custom_field.id
  value            text
    values: none (9,412 distinct, over the
            1,000-value limit)
table custom_field
  id, name, title, field_type`;

const REGISTRY_CONTEXT = `table customers
  id, name, email, country, created_at
  custom properties (from custom_field_value, 14, top 4 shown)
    plan     category  98%  Free | Starter | Pro | Enterprise
             "Plan Tier" is merged into it
    seats    integer   71%  5–300, 3% aren't numbers
             also called: licenses, users
    region   category  93%  AMER | EMEA | APAC
    mrr_usd  currency  69%  "MRR", monthly recurring revenue
  … list_properties (proposed tool) for the other 10`;

function Conversation({
  badge,
  title,
  messages,
  context,
  contextNote,
}: {
  badge: string;
  title: string;
  messages: MetabotMessage[];
  context?: string;
  contextNote?: string;
}) {
  return (
    <Paper withBorder radius="lg" p="lg" flex={1} miw={0}>
      <Stack gap="lg">
        <Group gap="sm">
          <Badge color="brand" variant="light">
            {badge}
          </Badge>
          <Text fw="bold">{title}</Text>
        </Group>
        <Box>
          <Messages
            messages={messages}
            isDoingScience={false}
            debug={false}
            readonly
            conversationId={badge}
            size="md"
          />
        </Box>
        {context && (
          <Stack gap="sm">
            <Text size="sm" fw="bold" c="text-secondary">
              {t`What Metabot reads about the table`}
            </Text>
            <Code block>{context}</Code>
            {contextNote && (
              <Text size="sm" c="text-secondary">
                {contextNote}
              </Text>
            )}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

export function MetabotComparisonPrototype() {
  return (
    <Stack p="xl" gap="xl" bg="background_page-secondary" mih="100vh">
      <Group gap="sm">
        <Title
          order={2}
        >{t`Metabot with and without the property registry`}</Title>
        <Badge color="warning" variant="light">
          {t`Illustrative: scripted answers`}
        </Badge>
      </Group>
      <Group align="stretch" gap="xl" wrap="nowrap">
        <Conversation
          badge={t`Today`}
          title={t`Metabot reads the tables as they are`}
          messages={TODAY_MESSAGES}
          context={TODAY_CONTEXT}
          contextNote={t`It sees two tables joined by IDs, not that they add columns to Customers. Every value is text, and it can't tell that two fields mean the same thing. The answer is wrong: '7' > '50' is true when compared as text.`}
        />
        <Conversation
          badge={t`With the registry`}
          title={t`Properties are typed columns of Customers`}
          messages={REGISTRY_MESSAGES}
          context={REGISTRY_CONTEXT}
          contextNote={t`Short and ranked by coverage. The long tail is one tool call away, so a HubSpot-sized registry doesn't flood the prompt.`}
        />
      </Group>
    </Stack>
  );
}

export function MetabotDiscoveryPrototype() {
  return (
    <Stack p="xl" gap="xl" bg="background_page-secondary" mih="100vh">
      <Badge color="warning" variant="light" w="fit-content">
        {t`Illustrative: scripted answers`}
      </Badge>
      <Conversation
        badge={t`With the registry`}
        title={t`Discovery: Metabot can say what exists`}
        messages={DISCOVERY_MESSAGES}
      />
    </Stack>
  );
}
