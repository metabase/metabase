import { t } from "ttag";

import {
  ActionIcon,
  Badge,
  Box,
  Group,
  Icon,
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
  const managementAllowed = canManage && index.managed_by_metabase;

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
          {index.managed_by_metabase && (
            <Tooltip
              label={t`Recreated when this transform re-runs.`}
            >
              <Badge variant="light" color="brand">{t`Managed`}</Badge>
            </Tooltip>
          )}
          <IndexStatusBadge status={requestStatus} />
        </Group>

        <Box className={S.actions}>
          {managementAllowed && (
            <>
              <Tooltip label={t`Edit index`}>
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  aria-label={t`Edit index`}
                  onClick={() => onEdit(index)}
                >
                  <Icon name="pencil" size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={t`Drop index`}>
                <ActionIcon
                  variant="subtle"
                  color="danger"
                  size="sm"
                  aria-label={t`Drop index`}
                  onClick={() => onDrop(index)}
                >
                  <Icon name="trash" size={14} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
        </Box>
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
