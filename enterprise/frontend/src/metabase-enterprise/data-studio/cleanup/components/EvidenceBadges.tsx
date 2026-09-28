import { t } from "ttag";

import { Badge, Group } from "metabase/ui";

type EvidenceBadgesProps = {
  verified: boolean;
  official: boolean;
  popular: boolean;
  variant?: "light" | "filled";
};

export function EvidenceBadges({
  verified,
  official,
  popular,
  variant = "light",
}: EvidenceBadgesProps) {
  return (
    <Group gap="xs">
      {verified && <Badge variant={variant}>{t`Verified`}</Badge>}
      {official && <Badge variant={variant}>{t`Official`}</Badge>}
      {popular && <Badge variant={variant}>{t`Popular`}</Badge>}
    </Group>
  );
}
