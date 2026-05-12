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

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="center">
        <Box>
          <Text fw="bold">{t`Indexes on the target table`}</Text>
          <Text c="text-secondary" size="sm">
            {t`Includes both indexes the optimizer manages and any others on this table.`}
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
          {t`No indexes found. The target table hasn't been materialized yet, or there are no indexes on it.`}
        </Text>
      )}

      {data && data.indexes.length > 0 && (
        <Stack gap="xs">
          {data.indexes.map((idx) => (
            <IndexRow
              key={idx.name}
              index={idx}
              onDrop={handleDrop}
              busy={dropResult.isLoading}
              readOnly={readOnly}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
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
  const canDrop = !index.is_primary && !readOnly;
  return (
    <Box className={styles.row}>
      <Box miw={0}>
        <Group gap="xs" wrap="wrap">
          <Text fw="bold" ff="monospace">
            {index.name}
          </Text>
          <Badge color="gray" variant="light" size="sm">
            {index.access_method}
          </Badge>
          {index.is_primary && (
            <Badge color="blue" variant="light" size="sm">
              {t`Primary key`}
            </Badge>
          )}
          {!index.is_primary && index.is_unique && (
            <Badge color="violet" variant="light" size="sm">
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
        {canDrop ? (
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
            label={
              index.is_primary
                ? t`Primary keys can't be dropped from the optimizer.`
                : t`You don't have permission to drop indexes here.`
            }
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
      case "index-not-on-target":
        return t`Index ${name} isn't on this transform's target table.`;
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
