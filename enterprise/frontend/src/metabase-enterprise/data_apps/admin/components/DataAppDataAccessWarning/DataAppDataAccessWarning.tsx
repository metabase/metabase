import { t } from "ttag";

import { getDatabaseFocusPermissionsUrl } from "metabase/admin/permissions/utils/urls";
import { Link } from "metabase/router";
import {
  Anchor,
  Badge,
  Flex,
  HoverCard,
  Icon,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import type {
  DataAppMissingTable,
  DataAppUserPermissionWarning,
} from "metabase-types/api";

import S from "./DataAppDataAccessWarning.module.css";

interface Props {
  warning: DataAppUserPermissionWarning;
  userName: string;
}

export const DataAppDataAccessWarning = ({ warning, userName }: Props) => {
  const label = t`Missing data access`;

  return (
    <HoverCard
      position="bottom-end"
      openDelay={150}
      closeDelay={100}
      shadow="md"
    >
      <HoverCard.Target>
        <UnstyledButton
          className={S.button}
          aria-label={label}
          style={{ flexShrink: 0 }}
        >
          <Badge
            className={S.badge}
            size="sm"
            c="text-primary"
            bdrs="sm"
            tt="none"
          >
            {label}
          </Badge>
        </UnstyledButton>
      </HoverCard.Target>

      <HoverCard.Dropdown
        data-testid="data-access-warning-popover"
        p="lg"
        w="30rem"
      >
        <Stack gap="lg">
          <Text size="sm">
            {t`${userName} doesn’t have permission to view these tables used in this app:`}
          </Text>

          <Stack
            component="ul"
            data-testid="missing-tables-list"
            gap="sm"
            m={0}
            pl={0}
            style={{ listStyle: "none" }}
          >
            {warning.missing_tables.map((table) => {
              const parts = getMissingTableSegments(table);

              return (
                <Flex
                  component="li"
                  key={table.id}
                  align="center"
                  gap={4}
                  wrap="wrap"
                >
                  {parts.map((part, index) => (
                    <Flex key={part.url} align="center" gap={4}>
                      <Anchor
                        component={Link}
                        to={part.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        size="sm"
                        fw={700}
                      >
                        {part.label}
                      </Anchor>

                      {index < parts.length - 1 && (
                        <Icon
                          name="chevronright"
                          size={12}
                          c="text-secondary"
                          aria-hidden
                        />
                      )}
                    </Flex>
                  ))}
                </Flex>
              );
            })}
          </Stack>
        </Stack>
      </HoverCard.Dropdown>
    </HoverCard>
  );
};

const getMissingTableSegments = (table: DataAppMissingTable) => [
  {
    label: table.database_name,
    url: getDatabaseFocusPermissionsUrl({
      databaseId: table.database_id,
    }),
  },
  ...(table.schema
    ? [
        {
          label: table.schema,
          url: getDatabaseFocusPermissionsUrl({
            databaseId: table.database_id,
            schemaName: table.schema,
          }),
        },
      ]
    : []),
  {
    label: table.name,
    url: getDatabaseFocusPermissionsUrl({
      databaseId: table.database_id,
      schemaName: table.schema ?? undefined,
      tableId: table.id,
    }),
  },
];
