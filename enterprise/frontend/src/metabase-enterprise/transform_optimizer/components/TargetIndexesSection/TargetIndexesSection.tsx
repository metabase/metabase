import { useCallback } from "react";
import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Icon,
  Loader,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import type { Transform } from "metabase-types/api";

import {
  useDropTargetIndexMutation,
  useListTargetIndexesQuery,
} from "../../api";
import type { DropIndexResult, TargetIndex } from "../../types";

import styles from "./TargetIndexesSection.module.css";

type Props = {
  transform: Transform;
  /**
   * When the user has no write permission on the source DB the drop
   * action is hidden — the BE refuses too, but we don't even surface the
   * button.
   */
  readOnly?: boolean;
};

export function TargetIndexesSection({ transform, readOnly }: Props) {
  const {
    data,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useListTargetIndexesQuery({ transformId: transform.id });
  const [dropIndex, dropResult] = useDropTargetIndexMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const handleDrop = useCallback(
    async (index: TargetIndex) => {
      const { data: result, error: dropError } = await dropIndex({
        transformId: transform.id,
        indexName: index.name,
      });
      if (dropError) {
        sendErrorToast(t`Failed to drop ${index.name}`);
        return;
      }
      const r = result as DropIndexResult | undefined;
      if (!r || r.status !== "dropped") {
        sendErrorToast(formatDropFailure(index.name, r));
        return;
      }
      sendSuccessToast(t`Dropped ${index.name}`);
      refetch();
    },
    [dropIndex, transform.id, refetch, sendSuccessToast, sendErrorToast],
  );

  // Group indices by [schema, table]. Target table first (so the
  // optimizer-managed indices land at the top), then source tables in
  // resolution order — the BE returns them in that order already.
  const groups = groupByTable(data?.indexes ?? []);

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="center">
        <Box>
          <Text fw="bold">{t`Indexes on referenced tables`}</Text>
          <Text c="text-secondary" size="sm">
            {t`Includes indexes on this transform's target table and the source tables it reads from.`}
          </Text>
        </Box>
        <Button
          variant="subtle"
          size="xs"
          leftSection={<Icon name="refresh" />}
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {t`Refresh`}
        </Button>
      </Group>

      {isLoading && (
        <Group gap="xs">
          <Loader size="xs" />
          <Text c="text-secondary" size="sm">{t`Loading indexes…`}</Text>
        </Group>
      )}

      {error && !isLoading && (
        <Alert color="error" icon={<Icon name="warning" />}>
          {t`Couldn't load indexes.`}
        </Alert>
      )}

      {data && data.indexes.length === 0 && !isLoading && (
        <Text c="text-secondary" size="sm">
          {t`No indexes found on any referenced table yet.`}
        </Text>
      )}

      {groups.length > 0 && (
        <Stack gap="md">
          {groups.map(({ schema, table, isTarget, rows }) => (
            <Stack key={`${schema}.${table}`} gap="xs">
              <Group gap="xs">
                <Text fw="bold" size="sm" ff="monospace">
                  {schema}.{table}
                </Text>
                {isTarget ? (
                  <Badge color="brand" variant="light" size="sm">
                    {t`Target`}
                  </Badge>
                ) : (
                  <Badge variant="default" size="sm">
                    {t`Source`}
                  </Badge>
                )}
              </Group>
              {rows.map((idx) => (
                <IndexRow
                  key={idx.name}
                  index={idx}
                  onDrop={handleDrop}
                  busy={dropResult.isLoading}
                  readOnly={readOnly}
                />
              ))}
            </Stack>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function groupByTable(indexes: TargetIndex[]) {
  const groups: Array<{
    schema: string;
    table: string;
    isTarget: boolean;
    rows: TargetIndex[];
  }> = [];
  const byKey = new Map<string, (typeof groups)[number]>();
  for (const idx of indexes) {
    const key = `${idx.schema}.${idx.table}`;
    let group = byKey.get(key);
    if (!group) {
      group = {
        schema: idx.schema,
        table: idx.table,
        isTarget: idx.is_target_table,
        rows: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.rows.push(idx);
  }
  return groups;
}

function IndexRow({
  index,
  onDrop,
  busy,
  readOnly,
}: {
  index: TargetIndex;
  onDrop: (index: TargetIndex) => void;
  busy: boolean;
  readOnly?: boolean;
}) {
  // Primary keys are foundational — we don't even offer the option to
  // drop them (would orphan FKs and uniqueness guarantees). For everything
  // else, the button is enabled unless the user lacks DB write perms,
  // in which case we render a disabled+tooltip variant.
  const isPk = index.is_primary;
  const canDrop = !isPk && !readOnly;
  return (
    <Box className={styles.row}>
      <Box miw={0}>
        <Group gap="xs" wrap="wrap">
          <Text fw="bold" ff="monospace">
            {index.name}
          </Text>
          <Badge variant="default" size="sm">
            {index.access_method}
          </Badge>
          {index.is_primary && (
            <Badge color="info" variant="light" size="sm">
              {t`Primary key`}
            </Badge>
          )}
          {!index.is_primary && index.is_unique && (
            <Badge color="brand" variant="light" size="sm">
              {t`Unique`}
            </Badge>
          )}
          {index.managed_by_optimizer && (
            <Badge color="success" variant="light" size="sm">
              {t`Optimizer-managed`}
            </Badge>
          )}
          {!index.is_valid && (
            <Badge color="error" variant="light" size="sm">
              {t`Invalid`}
            </Badge>
          )}
        </Group>
        <code className={styles.definition}>{index.definition}</code>
      </Box>
      <Group justify="flex-end" gap="xs" wrap="nowrap">
        {isPk ? null : canDrop ? (
          <Button
            color="error"
            variant="subtle"
            size="xs"
            disabled={busy}
            onClick={() => onDrop(index)}
          >
            {t`Drop`}
          </Button>
        ) : (
          <Tooltip
            label={t`You don't have permission to drop indexes here.`}
          >
            <span>
              <Button color="error" variant="subtle" size="xs" disabled>
                {t`Drop`}
              </Button>
            </span>
          </Tooltip>
        )}
      </Group>
    </Box>
  );
}

function formatDropFailure(
  name: string,
  result: DropIndexResult | undefined,
): string {
  if (!result) {
    return t`Couldn't drop ${name}`;
  }
  if (result.status === "failed") {
    return t`Couldn't drop ${name}: ${result.error_message}`;
  }
  if (result.status === "skipped") {
    switch (result.reason) {
      case "index-not-on-referenced-table":
        return t`Index ${name} isn't on this transform's target or source tables.`;
      case "unsafe-name":
        return t`Refused to drop ${name}: name contains unsafe characters.`;
      case "no-database":
        return t`Couldn't drop ${name}: no database connection.`;
      case "not-postgres":
        return t`Dropping indexes is only supported on Postgres in this branch.`;
      default:
        return t`Couldn't drop ${name}`;
    }
  }
  return t`Couldn't drop ${name}`;
}
