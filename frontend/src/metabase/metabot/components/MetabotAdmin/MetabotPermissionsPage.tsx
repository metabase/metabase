import { useRef, useState } from "react";
import { t } from "ttag";

import {
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import {
  Box,
  Button,
  Checkbox,
  Flex,
  Icon,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
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
      <PerGroupControls />

      <TotalInstanceLimits />

      <PerGroupLimits />

      <PerUserLimits />

      <CustomizeMetabot />

      <QuotaErrorMessage />
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
  const [groupLimits, setGroupLimits] = useState<Record<string, Limits>>(
    () => {
      const initial: Record<string, Limits> = {};
      GROUPS.forEach((g) => {
        initial[g] = defaultLimits();
      });
      return initial;
    },
  );

  const updateGroupLimit = (
    group: string,
    field: keyof Limits,
    value: number | "",
  ) => {
    setGroupLimits((prev) => ({
      ...prev,
      [group]: { ...prev[group], [field]: value },
    }));
  };

  return (
    <SettingsSection
      title={t`Per-group (total) limits`}
      description={t`Monthly aggregate limits for each group. When a group's total usage hits these limits, all members are blocked.`}
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
              <th style={thStyle}>{t`Max conversations`}</th>
              <th style={thStyle}>{t`Max tokens`}</th>
              <th style={thStyle}>{t`Max cost ($)`}</th>
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((group) => {
              const gl = groupLimits[group];
              return (
                <tr key={group}>
                  <td style={tdStyle}>
                    <Text fw={group === "All Users" ? 600 : 400}>
                      {group}
                    </Text>
                  </td>
                  <td style={tdStyle}>
                    <NumberInput
                      placeholder={t`Unlimited`}
                      value={gl.conversations}
                      onChange={(val) =>
                        updateGroupLimit(
                          group,
                          "conversations",
                          val as number | "",
                        )
                      }
                      min={0}
                      size="xs"
                      w={140}
                    />
                  </td>
                  <td style={tdStyle}>
                    <NumberInput
                      placeholder={t`Unlimited`}
                      value={gl.tokens}
                      onChange={(val) =>
                        updateGroupLimit(group, "tokens", val as number | "")
                      }
                      min={0}
                      size="xs"
                      w={140}
                      thousandSeparator=","
                    />
                  </td>
                  <td style={tdStyle}>
                    <NumberInput
                      placeholder={t`Unlimited`}
                      value={gl.cost}
                      onChange={(val) =>
                        updateGroupLimit(group, "cost", val as number | "")
                      }
                      min={0}
                      size="xs"
                      w={140}
                      decimalScale={2}
                      prefix="$"
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

// --- Icon Upload ---

function IconUpload({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onChange(reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <Box>
      <SettingHeader
        id="metabot-icon"
        title={t`Metabot's icon`}
        description={t`Upload a custom icon for Metabot. For best results, use an SVG or PNG with a transparent background.`}
      />
      <Paper
        p="md"
        withBorder
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "1rem",
        }}
      >
        <Box
          style={{
            width: 40,
            height: 40,
            borderRadius: "var(--mb-radius-sm, 4px)",
            border: "1px solid var(--mb-color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            backgroundColor: "var(--mb-color-background-secondary)",
          }}
        >
          {value ? (
            <img
              src={value}
              alt="Metabot icon"
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
              }}
            />
          ) : (
            <Icon name="insight" size={20} />
          )}
        </Box>
        <Flex gap="sm">
          <Button
            variant="default"
            size="xs"
            onClick={() => fileInputRef.current?.click()}
          >
            {value ? t`Change` : t`Upload`}
          </Button>
          {value && (
            <Button
              variant="subtle"
              size="xs"
              c="text-secondary"
              onClick={() => onChange(null)}
            >
              {t`Reset to default`}
            </Button>
          )}
        </Flex>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/svg+xml,image/png,image/jpeg"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
      </Paper>
    </Box>
  );
}

// --- Overrides ---

function CustomizeMetabot() {
  const [name, setName] = useState("Metabot");
  const [iconDataUrl, setIconDataUrl] = useState<string | null>(null);
  const [toneGuide, setToneGuide] = useState(
    "Be helpful, concise, and professional. Use plain language. Avoid jargon unless the user uses it first.",
  );
  const [globalMd, setGlobalMd] = useState(
    "# Metabot Instructions\n\nYou are a helpful data analyst assistant. When answering questions:\n- Always explain your reasoning\n- Cite specific tables and columns\n- Suggest follow-up questions when appropriate",
  );
  const [perUserMd, setPerUserMd] = useState("");

  return (
    <SettingsSection
      title={t`Customize Metabot`}
      description={t`Customize Metabot's identity and behavior instructions.`}
    >
      <Stack gap="lg">
        <TextInput
          label={t`Metabot's name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          w={240}
          size="sm"
        />

        <IconUpload value={iconDataUrl} onChange={setIconDataUrl} />

        <Box>
          <SettingHeader
            id="tone-guide"
            title={t`Tone guide`}
            description={t`Instructions for how Metabot should communicate with users.`}
          />
          <Textarea
            value={toneGuide}
            onChange={(e) => setToneGuide(e.target.value)}
            minRows={12}
            maxRows={12}
            size="sm"
          />
        </Box>

        <Box>
          <SettingHeader
            id="global-metabot-md"
            title={t`Global Metabot.md`}
            description={t`Markdown instructions included in every Metabot conversation. Use this to provide context about your data, business rules, or preferred query patterns.`}
          />
          <Textarea
            value={globalMd}
            onChange={(e) => setGlobalMd(e.target.value)}
            minRows={12}
            maxRows={12}
            size="sm"
            styles={{
              input: {
                fontFamily: 'Monaco, Menlo, "Courier New", monospace',
                fontSize: "0.8125rem",
              },
            }}
          />
        </Box>

        <Box>
          <SettingHeader
            id="per-user-metabot-md"
            title={t`Per-user Metabot.md`}
            description={t`Template for user-specific instructions. Users can customize their own version of this. Use {user_name} and {user_group} as placeholders.`}
          />
          <Textarea
            placeholder={t`e.g., Focus on {user_group} metrics and KPIs when answering questions.`}
            value={perUserMd}
            onChange={(e) => setPerUserMd(e.target.value)}
            minRows={12}
            maxRows={12}
            size="sm"
            styles={{
              input: {
                fontFamily: 'Monaco, Menlo, "Courier New", monospace',
                fontSize: "0.8125rem",
              },
            }}
          />
        </Box>
      </Stack>
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
