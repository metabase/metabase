import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import { getDatabaseFocusPermissionsUrl } from "metabase/permissions";
import {
  Badge,
  Box,
  Breadcrumbs,
  Card,
  FixedSizeIcon,
  Group,
  Menu,
  Stack,
  Title,
} from "metabase/ui";
import type { DataAppMissingTable } from "metabase-types/api";

import S from "./MissingTablesSection.module.css";

type MissingTablesSectionProps = {
  tables: DataAppMissingTable[];
};

export function MissingTablesSection({ tables }: MissingTablesSectionProps) {
  return (
    <Stack role="region" aria-label={t`Missing tables`}>
      <Group gap="sm" wrap="nowrap">
        <Badge color="negative" size="sm">
          {tables.length}
        </Badge>
        <Title order={5}>{t`Missing tables`}</Title>
      </Group>
      <Card p={0} shadow="none" withBorder>
        {tables.map((table) => (
          <MissingTableItem key={table.id} table={table} />
        ))}
      </Card>
    </Stack>
  );
}

type MissingTableItemProps = {
  table: DataAppMissingTable;
};

function MissingTableItem({ table }: MissingTableItemProps) {
  const [isOpened, setIsOpened] = useState(false);
  const location = [table.database_name, table.schema].filter(
    (part) => part != null,
  );

  return (
    <Menu opened={isOpened} onChange={setIsOpened}>
      <Menu.Target>
        <Stack
          className={cx(S.item, { [S.active]: isOpened })}
          p="lg"
          gap="sm"
          aria-label={table.name}
        >
          <Group gap="sm" wrap="nowrap">
            <FixedSizeIcon name="table" />
            <Box className={CS.textWrap} lh="1rem">
              {table.name}
            </Box>
          </Group>
          <Breadcrumbs
            separator={<FixedSizeIcon name="chevronright" size={12} />}
            c="text-secondary"
            ml="1rem"
            pl="sm"
          >
            {location.map((part) => (
              <Box key={part} className={CS.textWrap} lh="1rem">
                {part}
              </Box>
            ))}
          </Breadcrumbs>
        </Stack>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          component={ForwardRefLink}
          to={getDatabaseFocusPermissionsUrl({
            databaseId: table.database_id,
            schemaName: table.schema ?? undefined,
            tableId: table.id,
          })}
          target="_blank"
          leftSection={<FixedSizeIcon name="external" />}
        >
          {t`Change permissions`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
