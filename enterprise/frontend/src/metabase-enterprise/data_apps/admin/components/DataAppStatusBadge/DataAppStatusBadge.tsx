import { t } from "ttag";

import { Badge } from "metabase/ui";
import type { DataApp } from "metabase-types/api";

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
      bdrs="sm"
      tt="none"
    >
      {t`Disabled`}
    </Badge>
  );
};
