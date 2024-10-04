import cx from "classnames";
import { t } from "ttag";
import _ from "underscore";

import ExternalLink from "metabase/core/components/ExternalLink";
import Link from "metabase/core/components/Link";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { getLearnUrl } from "metabase/selectors/settings";
import { getApplicationName } from "metabase/selectors/whitelabel";
import {
  Box,
  Button,
  Icon,
  type IconName,
  Menu,
  Stack,
  Text,
  Title,
} from "metabase/ui";

import { PaddedSidebarLink } from "../MainNavbar.styled";

type SidebarOnboardingProps = {
  hasOwnDatabase: boolean;
  isAdmin: boolean;
};

export function SidebarOnboardingSection({
  hasOwnDatabase,
  isAdmin,
}: SidebarOnboardingProps) {
  const initialState = !hasOwnDatabase;
  const applicationName = useSelector(getApplicationName);

  return (
    <Box
      m={0}
      bottom={0}
      pos="sticky"
      bg="bg-white"
      className={cx({ [CS.borderTop]: !initialState })}
    >
      <Box px="md" py="md">
        {/*eslint-disable-next-line no-unconditional-metabase-links-render -- This link is only temporary. It will be replaced with an internal link to a page. */}
        <ExternalLink href={getLearnUrl()} className={CS.noDecoration}>
          {/* TODO: We currently don't have a `selected` state. Will be added in MS2 when we add the onboarding page. */}
          <PaddedSidebarLink icon="learn">
            {t`How to use ${applicationName}`}
          </PaddedSidebarLink>
        </ExternalLink>
      </Box>
      {isAdmin && (
        <Box px="xl" pb="md" className={cx({ [CS.borderTop]: initialState })}>
          {initialState && (
            <Text
              fz="sm"
              my="md"
              lh="1.333"
            >{t`Start by adding your data. Connect to a database or upload a CSV file.`}</Text>
          )}

          <Menu position="right-end" shadow="md">
            <Menu.Target>
              <Button
                leftIcon={<Icon name="add_data" />}
                fullWidth
              >{t`Add data`}</Button>
            </Menu.Target>
            <Menu.Dropdown>
              <SidebarOnboardingMenuItem
                icon="database"
                title={t`Add a database`}
                to="/admin/databases/create"
                subtitle={t`PostgreSQL, MySQL, Snowflake, ...`}
              />

              <SidebarOnboardingMenuItem
                icon="table2"
                title={t`Upload a spreadsheet`}
                to="/admin/settings/uploads"
                subtitle={t`.csv, .tsv (50 MB max)`}
              />
            </Menu.Dropdown>
          </Menu>
        </Box>
      )}
    </Box>
  );
}

type OnboaringMenuItemProps = {
  icon: IconName;
  title: string;
  to: string;
  subtitle: string;
};

function SidebarOnboardingMenuItem({
  icon,
  title,
  to,
  subtitle,
}: OnboaringMenuItemProps) {
  return (
    <Menu.Item icon={<Icon name={icon} />} style={{ alignItems: "flex-start" }}>
      <Link to={to}>
        <Stack spacing="xs">
          <Title c="inherit" order={4}>
            {title}
          </Title>
          <Text c="inherit" size="sm">
            {subtitle}
          </Text>
        </Stack>
      </Link>
    </Menu.Item>
  );
}
