import { t } from "ttag";

import { useGetPublicLinkRefusalQuery } from "metabase/api";
import { Link } from "metabase/common/components/Link";
import { Box, Icon, Menu, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { PublicLinkEntity } from "metabase-types/api";

export function PublicLinkMenuItem({
  hasPublicLink,
  entity,
  onClick,
}: {
  hasPublicLink: boolean;
  entity: PublicLinkEntity;
  onClick: () => void;
}) {
  const { data } = useGetPublicLinkRefusalQuery(entity);
  const refusal = data?.refusal;

  // An existing link stays reachable, since the popover is where it is copied
  // and removed; only creating a new one is refused.
  if (refusal && !hasPublicLink) {
    return (
      <Menu.Item
        leftSection={<Icon name="globe" aria-hidden />}
        component="div"
        disabled
      >
        <Box maw="20rem">
          {t`Create a public link`}
          <Text size="sm" c="text-secondary" style={{ textWrap: "pretty" }}>
            {refusal.message}
          </Text>
          <Text
            component={Link}
            to={Urls.viewDatabase(refusal.database.id)}
            target="_blank"
            size="sm"
            c="core-brand"
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
