import { t } from "ttag";

import type { DataApp } from "metabase-types/api";
import { Badge } from "metabase/ui";

type Props = {
  app: DataApp;
};

export const DataAppStatusBadge = ({ app }: Props) => {
  if (app.enabled) {
    return null;
  }

  return (
    <Badge
      size="md"
      c="text-secondary"
      bg="background-secondary"
      bdrs="xs"
      tt="none"
    >
      {t`Disabled`}
    </Badge>
  );
};
