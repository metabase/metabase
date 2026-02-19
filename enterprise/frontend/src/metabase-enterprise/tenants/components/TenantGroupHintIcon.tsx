import { t } from "ttag";

import { Icon, Tooltip } from "metabase/ui";

export const TenantGroupHintIcon = () => (
  <Tooltip label={t`This is a tenant group`}>
    <Icon name="globe" c="text-secondary" />
  </Tooltip>
);
