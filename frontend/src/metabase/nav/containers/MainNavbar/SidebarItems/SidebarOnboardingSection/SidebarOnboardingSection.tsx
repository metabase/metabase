import { useMediaQuery } from "@mantine/hooks";
import cx from "classnames";
import { t } from "ttag";
import _ from "underscore";

import Link from "metabase/core/components/Link";
import CS from "metabase/css/core/index.css";
import { getHasOwnDatabase } from "metabase/selectors/data";
import { Box, Button, Icon, Menu, Stack, Text, Title } from "metabase/ui";
import { breakpoints } from "metabase/ui/theme";

import { trackAddDataViaDatabase } from "./analytics";
import type { OnboaringMenuItemProps, SidebarOnboardingProps } from "./types";

export function SidebarOnboardingSection({
  databases,
  isAdmin,
}: SidebarOnboardingProps) {
  const isDatabaseAdded = getHasOwnDatabase(databases);
  const showCTASection = !isDatabaseAdded;

  const isMobileSafe = useMediaQuery(`(min-width: ${breakpoints.sm})`);

  const canAddDatabase = isAdmin;

  return (
    <Box
      m={0}
      bottom={0}
      pos="sticky"
      bg="bg-white"
      className={cx({ [CS.borderTop]: showCTASection })}
    >
      {canAddDatabase && (
        <Box px="xl" py="md" data-testid="sidebar-add-data-section">
          {showCTASection && (
            <Text
              fz="sm"
              mb="md"
              lh="1.333"
            >{t`Start by adding your data. Connect to a database or upload a CSV file.`}</Text>
          )}

          <Menu position={isMobileSafe ? "right-end" : "top"} shadow="md">
            <Menu.Target>
              <Button
                leftIcon={<Icon name="add_data" />}
                fullWidth
              >{t`Add data`}</Button>
            </Menu.Target>
            <Menu.Dropdown>
              <AddDatabaseButton />
            </Menu.Dropdown>
          </Menu>
        </Box>
      )}
    </Box>
  );
}

function SidebarOnboardingMenuItem({
  icon,
  title,
  subtitle,
  onClick,
}: OnboaringMenuItemProps) {
  return (
    <Menu.Item
      icon={<Icon name={icon} />}
      style={{ alignItems: "flex-start" }}
      onClick={onClick}
    >
      <Stack spacing="xs">
        <Title c="inherit" order={4}>
          {title}
        </Title>
        <Text c="inherit" size="sm">
          {subtitle}
        </Text>
      </Stack>
    </Menu.Item>
  );
}

function AddDatabaseButton() {
  return (
    <Link to="/admin/databases/create">
      <SidebarOnboardingMenuItem
        icon="database"
        title={t`Add a database`}
        subtitle={t`PostgreSQL, MySQL, Snowflake, ...`}
        onClick={() => trackAddDataViaDatabase()}
      />
    </Link>
  );
}
