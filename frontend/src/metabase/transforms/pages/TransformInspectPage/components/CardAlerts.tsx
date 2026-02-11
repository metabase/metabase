import { match } from "ts-pattern";

import { Alert, Icon, Stack } from "metabase/ui";
import type { TriggeredAlert } from "metabase-lib/transforms-inspector";

type CardAlertsProps = {
  alerts: TriggeredAlert[];
  fullWidth?: boolean;
};

export const CardAlerts = ({ alerts, fullWidth }: CardAlertsProps) => {
  if (alerts.length === 0) {
    return null;
  }

  return (
    <Stack gap="xs" w={fullWidth ? "100%" : undefined}>
      {alerts.map((alert) => (
        <Alert
          key={alert.id}
          icon={
            <Icon
              name={match(alert.severity)
                .with("error", () => "warning" as const)
                .with("warning", () => "warning" as const)
                .otherwise(() => "info" as const)}
            />
          }
          color={match(alert.severity)
            .with("error", () => "error" as const)
            .with("warning", () => "warning" as const)
            .otherwise(() => "brand" as const)}
          variant="light"
        >
          {alert.message}
        </Alert>
      ))}
    </Stack>
  );
};
