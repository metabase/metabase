import { t } from "ttag";

import { Badge, Tooltip } from "metabase/ui";
import type { DataApp } from "metabase-types/api";

import { getOutdatedDataAppMessage } from "../../../constants";

type Props = {
  app: DataApp;
};

export const DataAppStatusBadge = ({ app }: Props) => (
  <>
    {app.outdated && (
      <Tooltip label={getOutdatedDataAppMessage(app.version)}>
        <Badge
          size="md"
          c="text-primary"
          bg="background_surface-warning-strong"
          bdrs="xs"
          tt="none"
        >
          {t`Outdated`}
        </Badge>
      </Tooltip>
    )}

    {!app.enabled && (
      <Badge
        size="md"
        c="text-secondary"
        bg="background-secondary"
        bdrs="xs"
        tt="none"
      >
        {t`Disabled`}
      </Badge>
    )}
  </>
);
