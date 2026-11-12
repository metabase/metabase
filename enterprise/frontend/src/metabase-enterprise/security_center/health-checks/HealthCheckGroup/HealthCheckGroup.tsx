import { Accordion, Badge, Stack } from "metabase/ui";
import type { HealthCheck, HealthCheckStatus } from "metabase-types/api";

import { HealthCheckCard } from "../HealthCheckCard/HealthCheckCard";
import { getStatusInfo } from "../utils";

import S from "./HealthCheckGroup.module.css";

type HealthCheckGroupProps = {
  status: HealthCheckStatus;
  checks: HealthCheck[];
};

export const HealthCheckGroup = ({ status, checks }: HealthCheckGroupProps) => {
  const { label, badgeColor } = getStatusInfo(status);
  const isEmpty = checks.length === 0;

  return (
    <Accordion
      defaultValue={status === "fail" && !isEmpty ? status : null}
      transitionDuration={0}
      classNames={{ content: S.groupContent }}
    >
      <Accordion.Item value={status}>
        <Accordion.Control
          disabled={isEmpty}
          icon={
            <Badge color={badgeColor} size="xs">
              {checks.length}
            </Badge>
          }
        >
          {label}
        </Accordion.Control>
        <Accordion.Panel>
          <Stack gap="lg">
            {checks.map((check) => (
              <HealthCheckCard key={check.id} check={check} />
            ))}
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
};
