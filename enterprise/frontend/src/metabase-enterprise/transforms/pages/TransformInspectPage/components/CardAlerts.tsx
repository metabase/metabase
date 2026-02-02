import { match } from "ts-pattern";

import { Alert, Icon, Stack } from "metabase/ui";
import type { TriggeredAlert } from "metabase-lib/transforms-inspector";

type CardAlertsProps = {
  alerts: TriggeredAlert[];
  cardId: string;
  fullWidth?: boolean;
};

const getAlertColor = (severity: TriggeredAlert["severity"]) =>
  match(severity)
    .with("error", () => "error" as const)
    .with("warning", () => "warning" as const)
    .otherwise(() => "brand" as const);

const getAlertIcon = (severity: TriggeredAlert["severity"]) =>
  match(severity)
    .with("error", () => <Icon name="warning" size={16} />)
    .with("warning", () => <Icon name="warning" size={16} />)
    .otherwise(() => <Icon name="info" size={16} />);

export const CardAlerts = ({ alerts, cardId, fullWidth }: CardAlertsProps) => {
  const cardAlerts = alerts.filter((a) => a.condition.card_id === cardId);

  if (cardAlerts.length === 0) {
    return null;
  }

  return (
    <Stack gap="xs" w={fullWidth ? "100%" : undefined}>
      {cardAlerts.map((alert) => (
        <Alert
          key={alert.id}
          icon={getAlertIcon(alert.severity)}
          color={getAlertColor(alert.severity)}
          variant="light"
        >
          {alert.message}
        </Alert>
      ))}
    </Stack>
  );
};
