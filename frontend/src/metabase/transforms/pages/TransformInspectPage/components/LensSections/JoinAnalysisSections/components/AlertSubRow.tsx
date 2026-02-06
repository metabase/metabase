import { match } from "ts-pattern";

import { Box, List } from "metabase/ui";
import type { TriggeredAlert } from "metabase-lib/transforms-inspector";

type AlertSubRowProps = {
  alerts: TriggeredAlert[];
  severity: TriggeredAlert["severity"] | null;
};

export const AlertSubRow = ({ alerts, severity }: AlertSubRowProps) => {
  if (!severity || alerts.length === 0) {
    return null;
  }

  return (
    <Box p="sm">
      <Box
        p="sm"
        bdrs="sm"
        bg={match(severity)
          .with("error", () => "background-error" as const)
          .with("warning", () => "background-warning" as const)
          .with("info", () => "background-secondary" as const)
          .exhaustive()}
      >
        <List>
          {alerts.map((alert) => (
            <List.Item key={alert.id}>{alert.message}</List.Item>
          ))}
        </List>
      </Box>
    </Box>
  );
};
