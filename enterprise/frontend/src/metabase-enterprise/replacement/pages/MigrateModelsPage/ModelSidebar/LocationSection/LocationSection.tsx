import { Link } from "react-router";
import { t } from "ttag";

import type { IconName } from "metabase/ui";
import { Anchor, FixedSizeIcon, Group, Stack } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import type { Card } from "metabase-types/api";

type LocationSectionProps = {
  card: Card;
};

export function LocationSection({ card }: LocationSectionProps) {
  if (card.collection == null) {
    return null;
  }

  return (
    <Stack role="region" aria-label={t`Location`} gap="sm">
      <LocationLink
        label={card.collection.name}
        icon="folder"
        to={Urls.collection(card.collection)}
      />
    </Stack>
  );
}

type LocationLinkProps = {
  label: string;
  icon: IconName;
  to: string;
};

function LocationLink({ icon, label, to }: LocationLinkProps) {
  return (
    <Anchor component={Link} lh="1rem" to={to} target="_blank">
      <Group gap="sm" wrap="nowrap">
        <FixedSizeIcon name={icon} />
        {label}
      </Group>
    </Anchor>
  );
}
