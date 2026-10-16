import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { Box, Icon, Menu, Text } from "metabase/ui";
import * as Urls from "metabase/urls";

import {
  type PublicLinkEntity,
  usePublicLinkRefusal,
} from "../use-public-link-refusal";

export function PublicLinkMenuItem({
  hasPublicLink,
  entity,
  onClick,
}: {
  hasPublicLink: boolean;
  entity: PublicLinkEntity;
  onClick: () => void;
}) {
  const refusingDatabase = usePublicLinkRefusal(entity);

  // An existing link stays reachable, since the popover is where it is copied
  // and removed; only creating a new one is refused.
  if (refusingDatabase && !hasPublicLink) {
    return (
      <Menu.Item
        leftSection={<Icon name="globe" aria-hidden />}
        component="div"
        disabled
      >
        <Box maw="20rem">
          {t`Create a public link`}
          <Text size="sm" c="text-secondary" style={{ textWrap: "pretty" }}>
            {t`${refusingDatabase.name} has database routing enabled and does not allow anonymous access, so a public link on it would return no data.`}
          </Text>
          <Text
            component={Link}
            to={Urls.viewDatabase(refusingDatabase.id)}
            target="_blank"
            size="sm"
            c="brand"
            fw="bold"
          >
            {t`Allow anonymous access`}
          </Text>
        </Box>
      </Menu.Item>
    );
  }

  return (
    <Menu.Item
      leftSection={<Icon name="globe" aria-hidden />}
      onClick={onClick}
    >
      {hasPublicLink ? t`Public link` : t`Create a public link`}
    </Menu.Item>
  );
}
