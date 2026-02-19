import { useState } from "react";
import { t } from "ttag";

import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  NumberInput,
  PasswordInput,
  Progress,
  Stack,
  Text,
  TextInput,
  Title,
} from "metabase/ui";

type SetupState = "not_configured" | "configuring" | "indexing" | "active";

interface MetabotProSemanticSearchSectionProps {
  enabled?: boolean;
}

export function MetabotProSemanticSearchSection({
  enabled = true,
}: MetabotProSemanticSearchSectionProps) {
  const [setupState, setSetupState] = useState<SetupState>("not_configured");
  const [indexingProgress, setIndexingProgress] = useState(0);

  // PostgreSQL form state
  const [host, setHost] = useState("");
  const [port, setPort] = useState<number | string>(5432);
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleConfigureClick = () => {
    setSetupState("configuring");
  };

  const handleSubmit = () => {
    setSetupState("indexing");

    // Simulate indexing progress
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setTimeout(() => {
          setSetupState("active");
        }, 500);
      }
      setIndexingProgress(Math.min(progress, 100));
    }, 800);
  };

  const handleCancel = () => {
    setSetupState("not_configured");
  };

  const isFormValid = host && database && username && password;

  if (!enabled) {
    return (
      <Alert color="info" variant="light">
        <Text size="sm" c="text-secondary">
          {t`Complete the provider setup to enable semantic search configuration.`}
        </Text>
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      {setupState === "not_configured" && (
        <>
          <Text size="sm" c="text-secondary">
            {t`Semantic search is optional but recommended for larger instances. It requires a PostgreSQL database with pgvector to store embeddings.`}
          </Text>
          <Box>
            <Button onClick={handleConfigureClick}>
              {t`Configure PostgreSQL for Embeddings`}
            </Button>
          </Box>
        </>
      )}

      {setupState === "configuring" && (
        <Stack gap="md">
          <Text size="sm" c="text-secondary">
            {t`Connect to a PostgreSQL database with pgvector extension to store embeddings for semantic search.`}
          </Text>

          <Group grow align="flex-start">
            <TextInput
              label={t`Host`}
              placeholder="localhost"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              required
            />
            <NumberInput
              label={t`Port`}
              placeholder="5432"
              value={port}
              onChange={setPort}
              w={100}
              styles={{ wrapper: { flexGrow: 0 } }}
            />
          </Group>

          <TextInput
            label={t`Database name`}
            placeholder="metabase_embeddings"
            value={database}
            onChange={(e) => setDatabase(e.target.value)}
            required
          />

          <TextInput
            label={t`Username`}
            placeholder="postgres"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />

          <PasswordInput
            label={t`Password`}
            placeholder={t`Enter password`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <Group gap="sm">
            <Button onClick={handleSubmit} disabled={!isFormValid}>
              {t`Connect and Start Indexing`}
            </Button>
            <Button variant="subtle" onClick={handleCancel}>
              {t`Cancel`}
            </Button>
          </Group>
        </Stack>
      )}

      {setupState === "indexing" && (
        <Stack gap="md">
          <Group justify="space-between">
            <Text fw="bold">{t`Indexing in progress`}</Text>
            <Badge color="brand" variant="light">
              {`${Math.round(indexingProgress)}%`}
            </Badge>
          </Group>
          <Progress value={indexingProgress} size="lg" animated />
          <Text size="sm" c="text-secondary">
            {t`Creating embeddings for your data. This runs in the background. You can continue using Metabot with keyword search while indexing completes.`}
          </Text>
        </Stack>
      )}

      {setupState === "active" && (
        <Stack gap="sm">
          <Group justify="space-between">
            <Text fw="bold">{t`Semantic Search`}</Text>
            <Badge color="success" variant="filled">
              {t`Active`}
            </Badge>
          </Group>
          <Text size="sm" c="text-secondary">
            {t`Semantic search is enabled. Metabot will automatically use semantic matching to find the most relevant data for your queries.`}
          </Text>
        </Stack>
      )}
    </Stack>
  );
}
