import { useState } from "react";
import { t } from "ttag";

import {
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import {
  Box,
  Checkbox,
  Flex,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Tabs,
  Text,
  Textarea,
} from "metabase/ui";

// --- Fake user groups ---

const GROUPS = [
  "All Users",
  "Administrators",
  "Engineering",
  "Sales",
  "Marketing",
  "Analytics",
  "Executive",
  "Customer Support",
  "Design",
  "Product",
  "Finance",
  "Legal",
  "HR",
  "Data Science",
  "DevOps",
  "QA",
  "Security",
  "Research",
  "Partnerships",
  "Operations",
];

const MODELS = [
  { value: "default", label: "Default" },
  { value: "claude-haiku", label: "Claude Haiku" },
  { value: "claude-sonnet", label: "Claude Sonnet" },
  { value: "claude-opus", label: "Claude Opus" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gemini-flash", label: "Gemini Flash" },
  { value: "gemini-pro", label: "Gemini Pro" },
];

interface GroupPermissions {
  enabled: boolean;
  search: boolean;
  sqlGen: boolean;
  nlq: boolean;
  otherTools: boolean;
  model: string;
}

interface Limits {
  conversations: number | "";
  tokens: number | "";
  cost: number | "";
}

const defaultGroupPerms = (): GroupPermissions => ({
  enabled: true,
  search: true,
  sqlGen: true,
  nlq: true,
  otherTools: true,
  model: "default",
});

const defaultLimits = (): Limits => ({
  conversations: "",
  tokens: "",
  cost: "",
});

// --- Styles ---

const thStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  textAlign: "left",
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "var(--mb-color-text-secondary)",
  borderBottom: "1px solid var(--mb-color-border)",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  fontSize: "0.875rem",
  borderBottom: "1px solid var(--mb-color-border)",
  whiteSpace: "nowrap",
  verticalAlign: "middle",
};

const tdCenter: React.CSSProperties = {
  ...tdStyle,
  textAlign: "center",
};

const thCenter: React.CSSProperties = {
  ...thStyle,
  textAlign: "center",
};

// --- Components ---

export function MetabotPermissionsPage() {
  return (
    <Stack gap="xl" style={{ margin: 32 }}>
      <Tabs defaultValue="permissions">
        <Tabs.List>
          <Tabs.Tab value="permissions">{t`Permissions`}</Tabs.Tab>
          <Tabs.Tab value="usage-limits">{t`Usage limits`}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="permissions">
          <Stack gap="xl" mt="xl">
            <PerGroupControls />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="usage-limits">
          <Stack gap="xl" mt="xl">
            <TotalInstanceLimits />
            <PerGroupLimits />
            <PerUserLimits />
            <QuotaErrorMessage />
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

// --- Per User-group Controls ---

function PerGroupControls() {
  const [perms, setPerms] = useState<Record<string, GroupPermissions>>(() => {
    const initial: Record<string, GroupPermissions> = {};
    GROUPS.forEach((g) => {
      initial[g] = defaultGroupPerms();
    });
    initial["Customer Support"] = {
      ...defaultGroupPerms(),
      sqlGen: false,
      otherTools: false,
    };
    initial["Legal"] = {
      ...defaultGroupPerms(),
      enabled: false,
      search: false,
      sqlGen: false,
      nlq: false,
      otherTools: false,
    };
    return initial;
  });

  const updatePerm = (
    group: string,
    key: keyof GroupPermissions,
    value: boolean | string,
  ) => {
    setPerms((prev) => ({
      ...prev,
      [group]: { ...prev[group], [key]: value },
    }));
  };

  return (
    <SettingsSection
      title={t`Per user-group controls`}
      description={t`Control which groups can use Metabot and which capabilities are available to them.`}
    >
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
              <th style={thStyle}>{t`Group`}</th>
              <th style={thCenter}>{t`Metabot`}</th>
              <th style={thCenter}>{t`AI search`}</th>
              <th style={thCenter}>{t`SQL gen`}</th>
              <th style={thCenter}>{t`NLQ`}</th>
              <th style={thCenter}>{t`Other tools`}</th>
              <th style={thStyle}>{t`Model`}</th>
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((group) => {
              const p = perms[group];
              const disabled = !p.enabled;
              return (
                <tr key={group}>
                  <td style={tdStyle}>
                    <Text fw={group === "All Users" ? 600 : 400}>
                      {group}
                    </Text>
                  </td>
                  <td style={tdCenter}>
                    <Checkbox
                      checked={p.enabled}
                      onChange={(e) =>
                        updatePerm(group, "enabled", e.target.checked)
                      }
                      size="sm"
                      styles={{ root: { display: "flex", justifyContent: "center" } }}
                    />
                  </td>
                  <td style={tdCenter}>
                    <Checkbox
                      checked={p.search}
                      onChange={(e) =>
                        updatePerm(group, "search", e.target.checked)
                      }
                      size="sm"
                      disabled={disabled}
                      styles={{ root: { display: "flex", justifyContent: "center" } }}
                    />
                  </td>
                  <td style={tdCenter}>
                    <Checkbox
                      checked={p.sqlGen}
                      onChange={(e) =>
                        updatePerm(group, "sqlGen", e.target.checked)
                      }
                      size="sm"
                      disabled={disabled}
                      styles={{ root: { display: "flex", justifyContent: "center" } }}
                    />
                  </td>
                  <td style={tdCenter}>
                    <Checkbox
                      checked={p.nlq}
                      onChange={(e) =>
                        updatePerm(group, "nlq", e.target.checked)
                      }
                      size="sm"
                      disabled={disabled}
                      styles={{ root: { display: "flex", justifyContent: "center" } }}
                    />
                  </td>
                  <td style={tdCenter}>
                    <Checkbox
                      checked={p.otherTools}
                      onChange={(e) =>
                        updatePerm(group, "otherTools", e.target.checked)
                      }
                      size="sm"
                      disabled={disabled}
                      styles={{ root: { display: "flex", justifyContent: "center" } }}
                    />
                  </td>
                  <td style={tdStyle}>
                    <Select
                      data={MODELS}
                      value={p.model}
                      onChange={(val) =>
                        updatePerm(group, "model", val ?? "default")
                      }
                      size="xs"
                      w={160}
                      disabled={disabled}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Box>
    </SettingsSection>
  );
}

// --- Limits inputs (reusable) ---

function LimitsInputs({
  limits,
  onChange,
}: {
  limits: Limits;
  onChange: (limits: Limits) => void;
}) {
  return (
    <Flex gap="lg" wrap="wrap">
      <NumberInput
        label={t`Max conversations`}
        placeholder={t`Unlimited`}
        value={limits.conversations}
        onChange={(val) =>
          onChange({ ...limits, conversations: val as number | "" })
        }
        min={0}
        w={200}
        size="sm"
      />
      <NumberInput
        label={t`Max tokens`}
        placeholder={t`Unlimited`}
        value={limits.tokens}
        onChange={(val) =>
          onChange({ ...limits, tokens: val as number | "" })
        }
        min={0}
        w={200}
        size="sm"
        thousandSeparator=","
      />
      <NumberInput
        label={t`Max cost ($)`}
        placeholder={t`Unlimited`}
        value={limits.cost}
        onChange={(val) =>
          onChange({ ...limits, cost: val as number | "" })
        }
        min={0}
        w={200}
        size="sm"
        decimalScale={2}
        prefix="$"
      />
    </Flex>
  );
}

// --- Per-User Limits ---

function PerUserLimits() {
  const [limits, setLimits] = useState<Limits>(defaultLimits());

  return (
    <SettingsSection
      title={t`Per-user limits`}
      description={t`Default monthly limits for individual users. These apply per user unless overridden at the group level.`}
    >
      <LimitsInputs limits={limits} onChange={setLimits} />
    </SettingsSection>
  );
}

// --- Per-Group Limits ---

function PerGroupLimits() {
  const [limitType, setLimitType] = useState<keyof Limits>("conversations");
  const [groupLimits, setGroupLimits] = useState<Record<string, Limits>>(
    () => {
      const initial: Record<string, Limits> = {};
      GROUPS.forEach((g) => {
        initial[g] = defaultLimits();
      });
      return initial;
    },
  );

  const updateGroupLimit = (group: string, value: number | "") => {
    setGroupLimits((prev) => ({
      ...prev,
      [group]: { ...prev[group], [limitType]: value },
    }));
  };

  const columnLabel =
    limitType === "conversations"
      ? t`Max conversations`
      : limitType === "tokens"
        ? t`Max tokens`
        : t`Max cost ($)`;

  const inputProps =
    limitType === "cost"
      ? { decimalScale: 2, prefix: "$" }
      : limitType === "tokens"
        ? { thousandSeparator: "," }
        : {};

  return (
    <SettingsSection
      title={t`Per-group (total) limits`}
      description={t`Monthly aggregate limits for each group. When a group's total usage hits these limits, all members are blocked.`}
    >
      <Stack gap="md">
        <Stack gap="xs">
          <Text size="sm" fw={500}>{t`How do you want to limit groups?`}</Text>
          <SegmentedControl
            value={limitType}
            onChange={(value) => setLimitType(value as keyof Limits)}
            data={[
              { value: "conversations", label: t`Total conversations` },
              { value: "tokens", label: t`Tokens` },
              { value: "cost", label: t`Cost ($)` },
            ]}
          />
        </Stack>
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
                <th style={thStyle}>{t`Group`}</th>
                <th style={{ ...thStyle, textAlign: "right" }}>{columnLabel}</th>
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((group) => (
                <tr key={group}>
                  <td style={tdStyle}>
                    <Text fw={group === "All Users" ? 600 : 400}>
                      {group}
                    </Text>
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    <NumberInput
                      placeholder={t`Unlimited`}
                      value={groupLimits[group][limitType]}
                      onChange={(val) =>
                        updateGroupLimit(group, val as number | "")
                      }
                      min={0}
                      size="xs"
                      w={160}
                      ml="auto"
                      {...inputProps}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      </Stack>
    </SettingsSection>
  );
}

// --- Total Instance Limits ---

function TotalInstanceLimits() {
  const [limits, setLimits] = useState<Limits>(defaultLimits());

  return (
    <SettingsSection
      title={t`Total instance limits`}
      description={t`Monthly global limits for the entire Metabase instance. When these are hit, Metabot is disabled for all users until the next month.`}
    >
      <LimitsInputs limits={limits} onChange={setLimits} />
    </SettingsSection>
  );
}

// --- Quota Error Message ---

function QuotaErrorMessage() {
  const [message, setMessage] = useState(
    "You've reached your usage limit for Metabot. Please contact your administrator or try again later.",
  );

  return (
    <SettingsSection
      title={t`Quota reached message`}
      description={t`The message shown to users when they hit their conversation, token, or cost limit.`}
    >
      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        minRows={3}
        autosize
        size="sm"
      />
    </SettingsSection>
  );
}
