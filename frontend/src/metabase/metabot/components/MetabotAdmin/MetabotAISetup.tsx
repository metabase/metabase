import { useState } from "react";
import { t } from "ttag";

import {
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import {
  Box,
  Button,
  Flex,
  PasswordInput,
  Select,
  Stack,
} from "metabase/ui";

type Provider = "anthropic" | "google" | "meta" | "openai" | "metabase";

const PROVIDER_OPTIONS: { value: Provider; label: string }[] = [
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google" },
  { value: "meta", label: "Meta" },
  { value: "openai", label: "OpenAI" },
  { value: "metabase", label: "Metabase" },
];

export function MetabotAISetup({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  const needsApiKey = selectedProvider && selectedProvider !== "metabase";

  const canConnect =
    selectedProvider === "metabase" ||
    (needsApiKey && apiKey.trim().length > 0);

  const handleConnect = () => {
    setIsConnecting(true);
    setTimeout(() => {
      setIsConnecting(false);
      onComplete();
    }, 1200);
  };

  return (
    <Box p="2rem" maw="40rem">
      <SettingsSection
        title={t`Set up AI for Metabase`}
        description={t`Choose an AI provider to power Metabot's natural language querying, data analysis, and conversational features.`}
      >
        <Stack gap="md">
          <Select
            label={t`AI provider`}
            placeholder={t`Select a provider`}
            data={PROVIDER_OPTIONS}
            value={selectedProvider}
            onChange={setSelectedProvider}
          />

          {needsApiKey && (
            <PasswordInput
              label={t`API Key`}
              placeholder={t`Enter your API key`}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          )}

          {selectedProvider && (
            <Flex>
              <Button
                variant="filled"
                onClick={handleConnect}
                disabled={!canConnect}
                loading={isConnecting}
              >
                {t`Connect`}
              </Button>
            </Flex>
          )}
        </Stack>
      </SettingsSection>
    </Box>
  );
}
