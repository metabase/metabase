import { t } from "ttag";

import { Badge } from "metabase/ui";

export function CheckoutBadge() {
  return (
    <Badge variant="light" color="brand">
      {t`Your checkout`}
    </Badge>
  );
}
