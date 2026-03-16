import { useState } from "react";
import { t } from "ttag";

import {
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import {
  Box,
  Button,
  Flex,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Text,
} from "metabase/ui";

const PROVIDER_OPTIONS = [
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google" },
  { value: "meta", label: "Meta" },
  { value: "openai", label: "OpenAI" },
  { value: "metabase", label: "Metabase AI" },
];

export function MetabotSettingsPage() {
  return (
    <Stack gap="xl">
      <AIProviderSection />

      <MetabotSection
        title={t`Metabot`}
        description={t`Configure the default Metabot available to all users in the main Metabase interface.`}
        enabledLabel={t`Metabot is enabled`}
        disabledLabel={t`Metabot is disabled`}
      />

      <MetabotSection
        title={t`Embedded Metabot`}
        description={t`Configure the Metabot component available when embedding Metabase in external applications.`}
        enabledLabel={t`Embedded Metabot is enabled`}
        disabledLabel={t`Embedded Metabot is disabled`}
      />
    </Stack>
  );
}

function AIProviderSection() {
  const [provider, setProvider] = useState<string | null>("anthropic");
  const [apiKey, setApiKey] = useState("sk-ant-****************************");

  const needsApiKey = provider && provider !== "metabase";

  return (
    <SettingsSection
      title={t`AI provider`}
      description={t`The AI service powering Metabot's features.`}
    >
      <Flex gap="md" align="flex-end" wrap="wrap">
        <Select
          label={t`Provider`}
          data={PROVIDER_OPTIONS}
          value={provider}
          onChange={setProvider}
          w={200}
          size="sm"
        />
        {needsApiKey && (
          <PasswordInput
            label={t`API Key`}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            w={320}
            size="sm"
          />
        )}
      </Flex>
    </SettingsSection>
  );
}

function MetabotSection({
  title,
  description,
  enabledLabel,
  disabledLabel,
}: {
  title: string;
  description: string;
  enabledLabel: string;
  disabledLabel: string;
}) {
  const [enabled, setEnabled] = useState(true);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [collection, setCollection] = useState(t`Our analytics`);

  return (
    <SettingsSection title={title} description={description}>
      <Box>
        <SettingHeader
          id="enable-toggle"
          title={t`Enable`}
        />
        <Flex align="center" gap="md" mt="md">
          <Switch
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            w="auto"
            size="sm"
          />
          <Text c={enabled ? "text-primary" : "text-secondary"} fw="500">
            {enabled ? enabledLabel : disabledLabel}
          </Text>
        </Flex>
      </Box>

      <Stack
        gap="lg"
        opacity={enabled ? 1 : 0.4}
        style={{
          pointerEvents: enabled ? "auto" : "none",
          transition: "opacity 150ms ease",
        }}
      >
        <Box>
          <SettingHeader
            id="verified-content"
            title={t`Verified content`}
            description={t`When enabled, Metabot will only use models and metrics marked as Verified.`}
          />
          <Switch
            label={t`Only use Verified content`}
            checked={verifiedOnly}
            onChange={(e) => setVerifiedOnly(e.target.checked)}
            w="auto"
            size="sm"
          />
        </Box>

        <Box>
          <SettingHeader
            id="collection"
            title={t`Collection for natural language querying`}
          />
          <Flex align="center" gap="sm" mb="sm">
            <Text c="text-secondary" fw="bold">
              {collection}
            </Text>
          </Flex>
          <Button variant="default">{t`Pick a different collection`}</Button>
        </Box>
      </Stack>
    </SettingsSection>
  );
}
