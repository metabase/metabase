import { useMemo, useState } from "react";
import { t } from "ttag";

import { SortableHeaderPill } from "metabase/ui/components/data-display/SortableHeaderPill";
import {
  Badge,
  Box,
  Button,
  Flex,
  Select,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";

// --- Fake conversation data ---

const PROFILES = ["nlq", "sql-gen", "omnibot", "agent-api", "mcp"];
const USERS = [
  "Alice Chen",
  "Bob Martinez",
  "Carol Kim",
  "David Okafor",
  "Elena Petrov",
  "Frank Dubois",
  "Grace Yamamoto",
  "Hank Johansson",
];
const GROUPS = ["Engineering", "Sales", "Marketing", "Analytics", "Executive"];
const IPS = [
  "192.168.1.42",
  "10.0.0.15",
  "172.16.0.88",
  "192.168.2.101",
  "10.0.1.33",
];
const TABLES_LIST = [
  "orders",
  "products",
  "people",
  "reviews",
  "invoices",
  "accounts",
];

const rand = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

interface ConversationRow {
  id: string;
  user: string;
  group: string;
  profile: string;
  date: string;
  messages: number;
  tokens: number;
  queries: number;
  searches: number;
  ip: string;
  embeddedUrl: string | null;
  failures: number;
  tables: string[];
}

const fakeUuid = (i: number) => {
  const hex = (n: number) => n.toString(16).padStart(8, "0");
  return `${hex(i)}-${hex(i * 7)}-4${hex(i * 13).slice(1, 4)}-a${hex(i * 17).slice(1, 4)}-${hex(i * 31)}${hex(i * 37).slice(0, 4)}`;
};

const FAKE_CONVERSATIONS: ConversationRow[] = Array.from(
  { length: 80 },
  (_, i) => {
    const profile = pick(PROFILES);
    const d = new Date(2026, 2, 16);
    d.setDate(d.getDate() - rand(0, 29));
    const isEmbedded =
      profile === "mcp" ||
      (profile === "agent-api" && Math.random() > 0.5);
    return {
      id: fakeUuid(i + 1000),
      user: pick(USERS),
      group: pick(GROUPS),
      profile,
      date: d.toISOString().slice(0, 10),
      messages: rand(2, 30),
      tokens: rand(500, 50000),
      queries: rand(0, 8),
      searches: rand(0, 5),
      ip: pick(IPS),
      embeddedUrl: isEmbedded
        ? `https://app.example.com/dashboard/${rand(1, 20)}`
        : null,
      failures: Math.random() > 0.85 ? rand(1, 3) : 0,
      tables: Array.from({ length: rand(1, 3) }, () => pick(TABLES_LIST)).filter(
        (v, idx, a) => a.indexOf(v) === idx,
      ),
    };
  },
);

type SortKey = keyof ConversationRow;
type SortDir = "asc" | "desc";

const thBase: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  textAlign: "left",
  borderBottom: "1px solid var(--mb-color-border)",
  whiteSpace: "nowrap",
};

const thBaseRight: React.CSSProperties = { ...thBase, textAlign: "right" };

const tdStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  fontSize: "0.875rem",
  borderBottom: "1px solid var(--mb-color-border)",
  whiteSpace: "nowrap",
  height: 40,
};

const tdRight: React.CSSProperties = { ...tdStyle, textAlign: "right" };

export function MetabotConversationList({
  filters,
  onSelectConversation,
}: {
  filters?: Record<string, string>;
  onSelectConversation: (id: string) => void;
}) {
  const [dayFilter, setDayFilter] = useState<string | null>(
    filters?.day ?? null,
  );
  const [userFilter, setUserFilter] = useState<string | null>(
    filters?.user ?? null,
  );
  const [groupFilter, setGroupFilter] = useState<string | null>(
    filters?.group ?? null,
  );
  const [profileFilter, setProfileFilter] = useState<string | null>(
    filters?.profile ?? null,
  );
  const [tableSearch, setTableSearch] = useState("");
  const [failedOnly, setFailedOnly] = useState(
    filters?.failedOnly === "true" || false,
  );
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const availableDates = useMemo(() => {
    const dates = [...new Set(FAKE_CONVERSATIONS.map((r) => r.date))].sort();
    return dates.map((d) => ({ value: d, label: d }));
  }, []);

  const filtered = useMemo(() => {
    let rows = FAKE_CONVERSATIONS;

    if (dayFilter) {
      rows = rows.filter((r) => r.date === dayFilter);
    }
    if (userFilter) {
      rows = rows.filter((r) => r.user === userFilter);
    }
    if (groupFilter) {
      rows = rows.filter((r) => r.group === groupFilter);
    }
    if (profileFilter) {
      rows = rows.filter((r) => r.profile === profileFilter);
    }
    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase();
      rows = rows.filter((r) =>
        r.tables.some((tbl) => tbl.toLowerCase().includes(q)),
      );
    }
    if (failedOnly) {
      rows = rows.filter((r) => r.failures > 0);
    }

    const sorted = [...rows].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      let cmp = 0;
      if (typeof aVal === "number" && typeof bVal === "number") {
        cmp = aVal - bVal;
      } else {
        cmp = String(aVal ?? "").localeCompare(String(bVal ?? ""));
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [dayFilter, userFilter, groupFilter, profileFilter, tableSearch, failedOnly, sortKey, sortDir]);

  return (
    <Stack gap="md">
      <Flex gap="sm" wrap="wrap">
        <Select
          placeholder={t`Date`}
          data={availableDates}
          value={dayFilter}
          onChange={setDayFilter}
          clearable
          w={150}
          size="sm"
        />
        <Select
          placeholder={t`User`}
          data={USERS.map((u) => ({ value: u, label: u }))}
          value={userFilter}
          onChange={setUserFilter}
          clearable
          w={160}
          size="sm"
        />
        <Select
          placeholder={t`Group`}
          data={GROUPS.map((g) => ({ value: g, label: g }))}
          value={groupFilter}
          onChange={setGroupFilter}
          clearable
          w={140}
          size="sm"
        />
        <Select
          placeholder={t`Profile`}
          data={PROFILES.map((p) => ({ value: p, label: p }))}
          value={profileFilter}
          onChange={setProfileFilter}
          clearable
          w={140}
          size="sm"
        />
        <TextInput
          placeholder={t`Search by table...`}
          value={tableSearch}
          onChange={(e) => setTableSearch(e.target.value)}
          w={180}
          size="sm"
        />
        <Button
          variant={failedOnly ? "filled" : "default"}
          size="sm"
          onClick={() => setFailedOnly(!failedOnly)}
        >
          {t`Connection failures`}
        </Button>
      </Flex>

      <Text c="text-secondary" size="sm">
        {t`${filtered.length} conversations`}
      </Text>

      <Box
        style={{
          border: "1px solid var(--mb-color-border)",
          borderRadius: "var(--mb-radius-md, 8px)",
          overflow: "auto",
          backgroundColor: "var(--mb-color-background-primary)",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thBase}><SortableHeaderPill name={t`User`} sort={sortKey === "user" ? sortDir : undefined} onClick={() => handleSort("user")} style={{ width: "fit-content" }} /></th>
              <th style={thBase}><SortableHeaderPill name={t`Group`} sort={sortKey === "group" ? sortDir : undefined} onClick={() => handleSort("group")} style={{ width: "fit-content" }} /></th>
              <th style={thBase}><SortableHeaderPill name={t`Profile`} sort={sortKey === "profile" ? sortDir : undefined} onClick={() => handleSort("profile")} style={{ width: "fit-content" }} /></th>
              <th style={thBase}><SortableHeaderPill name={t`Date`} sort={sortKey === "date" ? sortDir : undefined} onClick={() => handleSort("date")} style={{ width: "fit-content" }} /></th>
              <th style={thBaseRight}><SortableHeaderPill name={t`Msgs`} sort={sortKey === "messages" ? sortDir : undefined} align="right" onClick={() => handleSort("messages")} style={{ width: "fit-content" }} /></th>
              <th style={thBaseRight}><SortableHeaderPill name={t`Tokens`} sort={sortKey === "tokens" ? sortDir : undefined} align="right" onClick={() => handleSort("tokens")} style={{ width: "fit-content" }} /></th>
              <th style={thBaseRight}><SortableHeaderPill name={t`Queries`} sort={sortKey === "queries" ? sortDir : undefined} align="right" onClick={() => handleSort("queries")} style={{ width: "fit-content" }} /></th>
              <th style={thBaseRight}><SortableHeaderPill name={t`Searches`} sort={sortKey === "searches" ? sortDir : undefined} align="right" onClick={() => handleSort("searches")} style={{ width: "fit-content" }} /></th>
              <th style={thBase}><SortableHeaderPill name={t`IP`} sort={sortKey === "ip" ? sortDir : undefined} onClick={() => handleSort("ip")} style={{ width: "fit-content" }} /></th>
              <th style={thBase}><SortableHeaderPill name={t`Embed URL`} sort={sortKey === "embeddedUrl" ? sortDir : undefined} onClick={() => handleSort("embeddedUrl")} style={{ width: "fit-content" }} /></th>
              <th style={thBaseRight}><SortableHeaderPill name={t`Fails`} sort={sortKey === "failures" ? sortDir : undefined} align="right" onClick={() => handleSort("failures")} style={{ width: "fit-content" }} /></th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 50).map((row) => (
              <tr
                key={row.id}
                style={{ cursor: "pointer" }}
                onClick={() => onSelectConversation(row.id)}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor =
                    "var(--mb-color-background-hover)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = "";
                }}
              >
                <td style={tdStyle}>{row.user}</td>
                <td style={tdStyle}>{row.group}</td>
                <td style={tdStyle}>
                  <Badge variant="light" size="sm">
                    {row.profile}
                  </Badge>
                </td>
                <td style={tdStyle}>{row.date}</td>
                <td style={tdRight}>{row.messages}</td>
                <td style={tdRight}>{row.tokens.toLocaleString()}</td>
                <td style={tdRight}>{row.queries}</td>
                <td style={tdRight}>{row.searches}</td>
                <td style={{ ...tdStyle, color: "var(--mb-color-text-secondary)" }}>
                  {row.ip}
                </td>
                <td style={tdStyle}>
                  {row.embeddedUrl ? (
                    <Text
                      c="brand"
                      truncate
                      style={{ maxWidth: 160, fontSize: "inherit" }}
                    >
                      {row.embeddedUrl}
                    </Text>
                  ) : (
                    <span style={{ color: "var(--mb-color-text-tertiary)" }}>
                      --
                    </span>
                  )}
                </td>
                <td style={tdRight}>
                  {row.failures > 0 ? (
                    <span style={{ color: "var(--mb-color-error)", fontWeight: 600 }}>
                      {row.failures}
                    </span>
                  ) : (
                    <span style={{ color: "var(--mb-color-text-tertiary)" }}>
                      0
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </Stack>
  );
}
