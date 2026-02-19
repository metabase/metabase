import { useEffect, useState } from "react";
import { t } from "ttag";

import {
  Alert,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Loader,
  Stack,
  Text,
} from "metabase/ui";

import type { HealthCheckItem } from "./types";

const MOCK_HEALTH_CHECKS: HealthCheckItem[] = [
  {
    id: "model-library",
    label: t`Model Library`,
    description: t`Check if a model library exists for Metabot to reference`,
    status: "pass",
  },
  {
    id: "metadata",
    label: t`Metadata Annotations`,
    description: t`Check if tables and columns have descriptions`,
    status: "warning",
    recommendation: t`Adding descriptions to your tables and columns will improve Metabot's accuracy.`,
  },
  {
    id: "artifacts",
    label: t`Saved Questions & Dashboards`,
    description: t`Check for existing questions and dashboards Metabot can leverage`,
    status: "pass",
  },
];

function getStatusColor(status: HealthCheckItem["status"]) {
  switch (status) {
    case "pass":
      return "success";
    case "warning":
      return "warning";
    case "missing":
      return "error";
  }
}

function getStatusLabel(status: HealthCheckItem["status"]) {
  switch (status) {
    case "pass":
      return t`Good`;
    case "warning":
      return t`Could be better`;
    case "missing":
      return t`Missing`;
  }
}

interface HealthCheckRowProps {
  item: HealthCheckItem;
}

function HealthCheckRow({ item }: HealthCheckRowProps) {
  return (
    <Box>
      <Group justify="space-between" mb="xs">
        <Text fw={500}>{item.label}</Text>
        <Badge color={getStatusColor(item.status)} variant="light" size="sm">
          {getStatusLabel(item.status)}
        </Badge>
      </Group>
      <Text size="sm" c="text-secondary">
        {item.description}
      </Text>
      {item.recommendation && (
        <Text size="sm" c="warning" mt="xs">
          {item.recommendation}
        </Text>
      )}
    </Box>
  );
}

interface MetabotProHealthSectionProps {
  enabled?: boolean;
}

export function MetabotProHealthSection({
  enabled = true,
}: MetabotProHealthSectionProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [healthChecks, setHealthChecks] = useState<HealthCheckItem[]>([]);

  const runAnalysis = () => {
    setIsLoading(true);
    setHealthChecks([]);

    // Simulate loading health checks
    const timer = setTimeout(() => {
      setHealthChecks(MOCK_HEALTH_CHECKS);
      setIsLoading(false);
    }, 1500);

    return () => clearTimeout(timer);
  };

  useEffect(() => {
    if (!enabled) {
      return;
    }

    return runAnalysis();
  }, [enabled]);

  if (!enabled) {
    return (
      <Alert color="info" variant="light">
        <Text size="sm" c="text-secondary">
          {t`Complete the provider setup above to run instance health checks.`}
        </Text>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <Group gap="md" py="md">
        <Loader size="sm" />
        <Text c="text-secondary">{t`Analyzing your instance...`}</Text>
      </Group>
    );
  }

  const passCount = healthChecks.filter((c) => c.status === "pass").length;
  const totalCount = healthChecks.length;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Text size="sm" c="text-secondary">
          {passCount === totalCount
            ? t`Your instance is well-configured for Metabot.`
            : t`${passCount} of ${totalCount} checks passed. Review the recommendations below.`}
        </Text>
        <Button variant="subtle" size="xs" onClick={runAnalysis}>
          {t`Re-run Analysis`}
        </Button>
      </Group>

      <Stack gap="md">
        {healthChecks.map((check, index) => (
          <Box key={check.id}>
            <HealthCheckRow item={check} />
            {index < healthChecks.length - 1 && <Divider mt="md" />}
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}
