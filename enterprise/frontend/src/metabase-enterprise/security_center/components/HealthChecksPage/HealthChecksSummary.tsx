import { t } from "ttag";

import ShieldImage from "assets/img/shield-96x96.svg";
import { Card, Group, Icon, Stack, Text } from "metabase/ui";
import type { HealthCheck } from "metabase-types/api";

import { getStatusInfo } from "./utils";

type HealthChecksSummaryProps = {
  checks: HealthCheck[];
};

export const HealthChecksSummary = ({ checks }: HealthChecksSummaryProps) => {
  const passedCount = checks.filter((check) => check.status === "pass").length;
  const isAllClear = passedCount === checks.length;
  const isFailing = checks.some((check) => check.status === "fail");

  if (isAllClear) {
    return (
      <Card p="xxl" withBorder>
        <Stack align="center" gap="lg">
          <img src={ShieldImage} alt="" />
          <Text fw="bold">{t`All security checks pass`}</Text>
        </Stack>
      </Card>
    );
  }

  const { icon, iconColor } = getStatusInfo(isFailing ? "fail" : "unknown");

  return (
    <Card p="lg" withBorder>
      <Group gap="sm">
        <Icon name={icon} c={iconColor} />
        <Text fw="bold">{t`${passedCount} of ${checks.length} checks pass`}</Text>
      </Group>
    </Card>
  );
};
