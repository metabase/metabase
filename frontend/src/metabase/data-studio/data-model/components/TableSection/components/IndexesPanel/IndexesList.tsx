import { t } from "ttag";

import {
  ActionIcon,
  Badge,
  Box,
  Group,
  Icon,
  Menu,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import type { IndexInfo } from "metabase-types/api";

import { IndexStatusBadge } from "./IndexStatusBadge";
import S from "./IndexesList.module.css";

interface Props {
  indexes: IndexInfo[];
  canManage: boolean;
  onEdit: (index: IndexInfo) => void;
  onDrop: (index: IndexInfo) => void;
}

export function IndexesList({ indexes, canManage, onEdit, onDrop }: Props) {
  if (indexes.length === 0) {
    return (
      <Box ta="center" py="lg">
        <Text c="text-secondary">{t`No indexes on this table yet.`}</Text>
      </Box>
    );
  }

  return (
    <Stack gap="sm">
      {indexes.map((index) => (
        <IndexRow
          key={index.name}
          index={index}
          canManage={canManage}
          onEdit={onEdit}
          onDrop={onDrop}
        />
      ))}
    </Stack>
  );
}

interface RowProps {
  index: IndexInfo;
  canManage: boolean;
  onEdit: (index: IndexInfo) => void;
  onDrop: (index: IndexInfo) => void;
}

function IndexRow({ index, canManage, onEdit, onDrop }: RowProps) {
  const requestStatus = index.request?.status ?? "exists";
  const isMetabaseManaged = index.managed_by_metabase;
  const showActions = canManage;

  return (
    <Box className={S.row} data-testid="index-row">
      <Box className={S.rowHeader}>
        <Group gap="xs" wrap="nowrap" miw={0}>
          <Icon name="key" size={14} />
          <Text className={S.name} title={index.name}>
            {index.name}
          </Text>
          {index.is_unique && (
            <Badge variant="light" color="accent3">{t`Unique`}</Badge>
          )}
          {index.is_primary && (
            <Badge variant="light" color="brand">{t`Primary`}</Badge>
          )}
          {isMetabaseManaged && (
            <Tooltip label={t`Recreated when this transform re-runs.`}>
              <Badge variant="light" color="brand">{t`Managed`}</Badge>
            </Tooltip>
          )}
          <IndexStatusBadge status={requestStatus} />
        </Group>

        {showActions && (
          <Box className={S.actions}>
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  aria-label={t`Index actions`}
                >
                  <Icon name="ellipsis" size={14} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<Icon name="pencil" size={14} />}
                  onClick={() => onEdit(index)}
                >
                  {t`Edit`}
                </Menu.Item>
                <Menu.Item
                  c="danger"
                  leftSection={<Icon name="trash" size={14} />}
                  onClick={() => onDrop(index)}
                >
                  {t`Drop`}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Box>
        )}
      </Box>

      <Text className={S.definition}>{index.definition}</Text>

      {index.request?.error_message && (
        <Text c="error" size="xs">
          {index.request.error_message}
        </Text>
      )}
    </Box>
  );
}
