import { useState } from "react";
import { t } from "ttag";

import {
  Badge,
  Box,
  Button,
  Flex,
  Icon,
  SimpleGrid,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from "metabase/ui";

// --- Fake conversation detail ---

interface Message {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
}

interface ToolCall {
  name: string;
  input: string;
  result: string;
}

interface QueryInfo {
  sql: string;
  tables: string[];
  aggregated: boolean;
  sandboxed: boolean;
  routed: boolean;
  impersonated: boolean;
  filters: string[];
}

interface ConversationDetail {
  id: string;
  user: string;
  group: string;
  profile: string;
  date: string;
  rating: "up" | "down" | null;
  totalTokens: number;
  cost: number;
  queries: QueryInfo[];
  messages: Message[];
}

const FAKE_DETAIL: ConversationDetail = {
  id: "conv-1042",
  user: "Alice Chen",
  group: "Engineering",
  profile: "nlq",
  date: "2026-03-15",
  rating: "up",
  totalTokens: 12847,
  cost: 0.38,
  queries: [
    {
      sql: 'SELECT date_trunc(\'month\', created_at) AS month, COUNT(*) AS order_count, SUM(total) AS revenue\nFROM orders\nJOIN products ON orders.product_id = products.id\nWHERE products.category = \'Gadgets\'\nGROUP BY month\nORDER BY month',
      tables: ["orders", "products"],
      aggregated: true,
      sandboxed: false,
      routed: true,
      impersonated: false,
      filters: ["products.category = 'Gadgets'"],
    },
    {
      sql: "SELECT people.name, COUNT(orders.id) AS num_orders\nFROM people\nJOIN orders ON people.id = orders.user_id\nGROUP BY people.name\nORDER BY num_orders DESC\nLIMIT 10",
      tables: ["people", "orders"],
      aggregated: true,
      sandboxed: true,
      routed: false,
      impersonated: false,
      filters: [],
    },
  ],
  messages: [
    {
      role: "user",
      content: "What were our monthly gadget sales and revenue/sales amount last year?",
    },
    {
      role: "assistant",
      content:
        "I can help you look at gadget sales data. If you'd like to see the **total sales revenue** from gadgets instead of order count, let me know and I can adjust the analysis to sum up the order totals. Would that be more useful for your analysis?",
      toolCalls: [
        {
          name: "search_tables",
          input: '{"query": "gadgets sales orders products"}',
          result:
            'Found 3 relevant tables:\n- orders (245,000 rows)\n- products (1,200 rows, has category column)\n- reviews (18,000 rows)',
        },
      ],
    },
    {
      role: "user",
      content: "What's the SQL for this query?",
    },
    {
      role: "assistant",
      content:
        'The query I built uses Metabase\'s notebook editor (visual query builder), which doesn\'t directly expose SQL. However, here\'s what the equivalent SQL would be under the hood:\n\n```sql\nSELECT\n  TRUNC(o.CREATED_AT, \'month\') AS created_at_month,\n  COUNT(*) AS count\nFROM PUBLIC.ORDERS o\nJOIN PUBLIC.PRODUCTS p ON o.PRODUCT_ID = p.ID\nWHERE p.CATEGORY = \'Gadget\'\n  AND o.CREATED_AT >= \'2025-01-01\'\n  AND o.CREATED_AT < \'2026-01-01\'\nGROUP BY TRUNC(o.CREATED_AT, \'month\')\nORDER BY created_at_month\n```\n\nThis query:\n1. Joins **ORDERS** to **PRODUCTS** to access the product category\n2. Filters for only Gadget category products\n3. Restricts to orders created in 2025\n4. Groups by month of the creation date\n5. Counts the orders per month\n\nWould you like me to convert this to a SQL query in Metabase so you can run it directly, or make any adjustments to it?',
      toolCalls: [
        {
          name: "run_query",
          input:
            '{"sql": "SELECT date_trunc(\'month\', created_at) AS month, COUNT(*) AS order_count, SUM(total) AS revenue FROM orders JOIN products ON orders.product_id = products.id WHERE products.category = \'Gadgets\' GROUP BY month ORDER BY month"}',
          result: "Query returned 12 rows. Total revenue: $1,234,567.89",
        },
      ],
    },
    {
      role: "user",
      content: "Who were the top 10 customers by order count?",
    },
    {
      role: "assistant",
      content: "Let me find the top customers for you.",
      toolCalls: [
        {
          name: "run_query",
          input:
            '{"sql": "SELECT people.name, COUNT(orders.id) AS num_orders FROM people JOIN orders ON people.id = orders.user_id GROUP BY people.name ORDER BY num_orders DESC LIMIT 10"}',
          result:
            "Query returned 10 rows. Top customer: Jamie Rodriguez (47 orders)",
        },
      ],
    },
    {
      role: "assistant",
      content:
        "The top customer by order count is Jamie Rodriguez with 47 orders, followed by Sam Mitchell with 41 orders. The top 10 customers account for about 12% of all orders.",
    },
  ],
};

// --- Markdown-like rendering for assistant messages ---

function renderMarkdown(text: string) {
  const blocks: React.ReactNode[] = [];
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    // Code blocks
    if (lines[i].startsWith("```")) {
      const codeLines: string[] = [];
      i++; // skip opening ```
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push(
        <pre
          key={blocks.length}
          style={{
            overflow: "auto hidden",
            maxWidth: "100%",
            whiteSpace: "pre",
            background: "var(--mb-color-background-secondary)",
            padding: "0.625rem 0.75rem",
            borderRadius: "0.375rem",
            margin: "0.5rem 0",
            border: "1px solid var(--mb-color-border)",
            scrollbarWidth: "thin" as const,
          }}
        >
          <code
            style={{
              fontFamily: 'Monaco, Menlo, "Courier New", monospace',
              fontSize: "0.6875rem",
              lineHeight: 1.5,
              color: "var(--mb-color-text-primary)",
            }}
          >
            {codeLines.join("\n")}
          </code>
        </pre>,
      );
      continue;
    }

    // Ordered list items
    if (/^\d+\.\s/.test(lines[i])) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      blocks.push(
        <ol
          key={blocks.length}
          style={{
            paddingLeft: "1.5rem",
            marginBottom: "1rem",
            listStyleType: "decimal",
          }}
        >
          {items.map((item, idx) => (
            <li
              key={idx}
              style={{ marginBottom: "0.5rem", lineHeight: 1.5 }}
            >
              {renderInline(item)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // Unordered list items
    if (/^[-*]\s/.test(lines[i])) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s/, ""));
        i++;
      }
      blocks.push(
        <ul
          key={blocks.length}
          style={{
            paddingLeft: "1.5rem",
            marginBottom: "1rem",
            listStyleType: "disc",
          }}
        >
          {items.map((item, idx) => (
            <li
              key={idx}
              style={{ marginBottom: "0.5rem", lineHeight: 1.5 }}
            >
              {renderInline(item)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Empty lines
    if (lines[i].trim() === "") {
      i++;
      continue;
    }

    // Regular paragraph
    blocks.push(
      <p key={blocks.length} style={{ marginBottom: "1rem" }}>
        {renderInline(lines[i])}
      </p>,
    );
    i++;
  }

  return blocks;
}

function renderInline(text: string): React.ReactNode {
  // Handle bold (**text**) and inline code (`code`)
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      // Bold
      parts.push(
        <strong key={match.index}>{match[2]}</strong>,
      );
    } else if (match[3]) {
      // Inline code
      parts.push(
        <code
          key={match.index}
          style={{
            fontFamily: 'Monaco, Menlo, "Courier New", monospace',
            background: "var(--mb-color-background-secondary)",
            color: "var(--mb-color-text-primary)",
            padding: "0.125rem 0.375rem",
            borderRadius: "0.25rem",
            fontSize: "0.875em",
            border: "1px solid var(--mb-color-border)",
          }}
        >
          {match[3]}
        </code>,
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length === 1 ? parts[0] : parts;
}

// --- Components ---

function MetadataCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <Box
      p="md"
      style={{
        border: "1px solid var(--mb-color-border)",
        borderRadius: "var(--mb-radius-md, 8px)",
        backgroundColor: "var(--mb-color-background-primary)",
      }}
    >
      <Text c="text-secondary" size="xs" fw={500}>
        {label}
      </Text>
      <Text fw={700} size="lg" mt={4}>
        {value}
      </Text>
    </Box>
  );
}

function CollapsibleToolCall({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Box
      ml="sm"
      style={{
        borderLeft: "2px solid var(--mb-color-border)",
      }}
    >
      <UnstyledButton
        onClick={() => setExpanded((prev) => !prev)}
        p="sm"
        w="100%"
      >
        <Flex align="center" gap="xs">
          <Icon
            name={expanded ? "chevrondown" : "chevronright"}
            size={12}
          />
          <Icon name="gear" size={12} />
          <Text size="xs" fw={600} c="text-secondary">
            {toolCall.name}
          </Text>
        </Flex>
      </UnstyledButton>
      {expanded && (
        <Box px="sm" pb="sm">
          <Text
            size="xs"
            c="text-secondary"
            style={{
              fontFamily: 'Monaco, Menlo, "Courier New", monospace',
              fontSize: "0.6875rem",
            }}
          >
            {toolCall.input}
          </Text>
          <Text
            size="xs"
            mt={4}
            style={{
              fontFamily: 'Monaco, Menlo, "Courier New", monospace',
              fontSize: "0.6875rem",
            }}
          >
            {toolCall.result}
          </Text>
        </Box>
      )}
    </Box>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <Stack gap="xs">
      <Flex
        direction="column"
        align={isUser ? "flex-end" : "flex-start"}
        style={{
          alignSelf: isUser ? "flex-end" : "flex-start",
          maxWidth: isUser ? "90%" : "100%",
          minWidth: "6rem",
          width: isUser ? "fit-content" : undefined,
        }}
      >
        {isUser ? (
          <Box
            p="0.5rem 1rem"
            style={{
              borderRadius: "1rem",
              backgroundColor: "var(--mb-color-background-tertiary)",
              fontSize: "0.875rem",
              lineHeight: 1.5,
            }}
          >
            {message.content}
          </Box>
        ) : (
          <Box
            style={{
              fontSize: "0.875rem",
              lineHeight: 1.5,
            }}
          >
            {renderMarkdown(message.content)}
          </Box>
        )}
      </Flex>
      {message.toolCalls?.map((tc, i) => (
        <CollapsibleToolCall key={i} toolCall={tc} />
      ))}
    </Stack>
  );
}

export function MetabotConversationDetail({
  conversationId,
  onBack,
}: {
  conversationId: string;
  onBack: () => void;
}) {
  const detail = FAKE_DETAIL;

  return (
    <Stack gap="lg" style={{ maxWidth: 960 }}>
      <Flex align="center" gap="sm">
        <Button
          variant="subtle"
          size="sm"
          leftSection={<Icon name="chevronleft" size={14} />}
          onClick={onBack}
        >
          {t`Back to conversations`}
        </Button>
      </Flex>

      <Flex align="center" justify="space-between">
        <Box>
          <Title order={3}>
            {t`Conversation with ${detail.user}`}
          </Title>
          <Flex gap="sm" mt="xs" align="center">
            <Badge variant="light">{detail.profile}</Badge>
            <Text size="sm" c="text-secondary">
              {detail.group}
            </Text>
            <Text size="sm" c="text-secondary">
              {detail.date}
            </Text>
          </Flex>
        </Box>
        {detail.rating && (
          <Flex
            align="center"
            gap="xs"
            p="sm"
            style={{
              border: "1px solid var(--mb-color-border)",
              borderRadius: "var(--mb-radius-md, 8px)",
            }}
          >
            <Text size="sm" fw={500}>
              {t`Rating`}
            </Text>
            {detail.rating === "up" ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/><path d="M7 10v12"/></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/><path d="M17 14V2"/></svg>
            )}
          </Flex>
        )}
      </Flex>

      <SimpleGrid cols={4} spacing="md">
        <MetadataCard
          label={t`Total tokens`}
          value={detail.totalTokens.toLocaleString()}
        />
        <MetadataCard label={t`Cost`} value={`$${detail.cost.toFixed(2)}`} />
        <MetadataCard
          label={t`Queries run`}
          value={String(detail.queries.length)}
        />
        <MetadataCard
          label={t`Messages`}
          value={String(detail.messages.length)}
        />
      </SimpleGrid>

      <Box>
        <Title order={4} mb="md">
          {t`Conversation`}
        </Title>
        <Box
          p="lg"
          style={{
            backgroundColor: "var(--mb-color-background-primary)",
            border: "1px solid var(--mb-color-border)",
            borderRadius: "var(--mb-radius-md, 8px)",
            maxHeight: 960,
            overflowY: "auto",
          }}
        >
          <Stack gap="md">
            {detail.messages.map((msg, i) => (
              <MessageBubble key={i} message={msg} />
            ))}
          </Stack>
        </Box>
      </Box>

      <Box>
        <Title order={4} mb="md">
          {t`Queries generated`}
        </Title>
        <Stack gap="md">
          {detail.queries.map((q, i) => (
            <Box
              key={i}
              p="md"
              style={{
                border: "1px solid var(--mb-color-border)",
                borderRadius: "var(--mb-radius-md, 8px)",
                backgroundColor: "var(--mb-color-background-primary)",
              }}
            >
              <pre
                style={{
                  overflow: "auto hidden",
                  maxWidth: "100%",
                  whiteSpace: "pre",
                  background: "var(--mb-color-background-secondary)",
                  padding: "0.625rem 0.75rem",
                  borderRadius: "0.375rem",
                  margin: "0 0 0.75rem",
                  border: "1px solid var(--mb-color-border)",
                  scrollbarWidth: "thin" as const,
                }}
              >
                <code
                  style={{
                    fontFamily: 'Monaco, Menlo, "Courier New", monospace',
                    fontSize: "0.6875rem",
                    lineHeight: 1.5,
                    color: "var(--mb-color-text-primary)",
                  }}
                >
                  {q.sql}
                </code>
              </pre>

              <Flex gap="md" wrap="wrap" mb="sm">
                <Text size="xs" c="text-secondary">
                  <Text component="span" fw={600}>{t`Tables`}: </Text>
                  {q.tables.join(", ")}
                </Text>
                <Badge
                  variant="outline"
                  color="text-secondary"
                  size="sm"
                >
                  {q.aggregated ? t`Aggregated` : t`Raw`}
                </Badge>
                {q.sandboxed && (
                  <Badge variant="outline" color="text-secondary" size="sm">
                    {t`Sandboxed`}
                  </Badge>
                )}
                {q.routed && (
                  <Badge variant="outline" color="text-secondary" size="sm">
                    {t`Routed`}
                  </Badge>
                )}
                {q.impersonated && (
                  <Badge variant="outline" color="text-secondary" size="sm">
                    {t`Impersonated`}
                  </Badge>
                )}
              </Flex>

              {q.filters.length > 0 && (
                <Text size="xs" c="text-secondary">
                  <Text component="span" fw={600}>{t`Filters`}: </Text>
                  {q.filters.join(", ")}
                </Text>
              )}
            </Box>
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}
