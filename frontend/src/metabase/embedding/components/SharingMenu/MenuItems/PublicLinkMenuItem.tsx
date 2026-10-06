import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { Box, Icon, Menu, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { DatabaseId } from "metabase-types/api";

import { useDatabaseRefusingAnonymousAccess } from "../use-database-refusing-anonymous-access";

export function PublicLinkMenuItem({
  hasPublicLink,
  databaseIds = [],
  onClick,
}: {
  hasPublicLink: boolean;
  /** The databases this question or dashboard queries. */
  databaseIds?: DatabaseId[];
  onClick: () => void;
}) {
  const refusingDatabase = useDatabaseRefusingAnonymousAccess(databaseIds);

  // A link that already exists stays reachable, since the popover is also where
  // it is copied and removed. Only minting a new one that could never work is
  // refused — here, and by the API, which an admin can reach without the menu.
  //
  // Disabled rather than hidden on purpose: an option that vanishes leaves the
  // admin wondering where it went instead of what to change.
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
            {t`${refusingDatabase.name} has database routing turned on and does not allow anonymous access, so a public link would return no data.`}
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
