import { useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { useUpdateTableMutation } from "metabase/api";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { SegmentFilterEditor } from "metabase/querying/segments/components/SegmentFilterEditor";
import { getMetadata } from "metabase/selectors/metadata";
import { Button, Card, Group, Stack, Text, Title } from "metabase/ui";
import { useSelector } from "metabase/utils/redux";
import * as Lib from "metabase-lib";
import type { DatasetQuery, Table } from "metabase-types/api";

interface Props {
  table: Table;
}

export function TableDefaultFilterPanel({ table }: Props) {
  const metadata = useSelector(getMetadata);
  const [updateTable] = useUpdateTableMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();
  const [saving, setSaving] = useState(false);
  const seqRef = useRef(0);

  const persistedClause = table.settings?.default_filter_clause ?? null;

  const query = useMemo(() => {
    if (table.db_id == null) {
      return null;
    }
    const provider = Lib.metadataProvider(table.db_id, metadata);
    const legacy: DatasetQuery = {
      type: "query",
      database: table.db_id,
      query: {
        "source-table": table.id,
        ...(persistedClause ? { filter: persistedClause } : {}),
      },
    } as unknown as DatasetQuery;
    try {
      return Lib.fromJsQuery(provider, legacy);
    } catch {
      // Stored clause may reference a field that was removed from the warehouse.
      // Surface as if empty; admin can clear and re-pick.
      return Lib.fromJsQuery(provider, {
        type: "query",
        database: table.db_id,
        query: { "source-table": table.id },
      } as unknown as DatasetQuery);
    }
  }, [metadata, table.db_id, table.id, persistedClause]);

  const save = async (nextClause: unknown[] | null) => {
    const mySeq = ++seqRef.current;
    const prevSnapshot = persistedClause;
    setSaving(true);
    const { error } = await updateTable({
      id: table.id,
      settings: { default_filter_clause: nextClause },
    });
    if (seqRef.current !== mySeq) {
      return;
    }
    setSaving(false);
    if (error) {
      sendErrorToast(t`Failed to update default filter`);
      return;
    }
    sendSuccessToast(t`Default filter updated`, async () => {
      const { error: undoErr } = await updateTable({
        id: table.id,
        settings: { default_filter_clause: prevSnapshot },
      });
      sendUndoToast(undoErr);
    });
  };

  const handleChange = (nextQuery: Lib.Query) => {
    const legacy = Lib.toLegacyQuery(nextQuery);
    const filter =
      legacy.type === "query"
        ? ((legacy.query as { filter?: unknown[] }).filter ?? null)
        : null;
    void save(filter && (filter as unknown[]).length > 0 ? filter : null);
  };

  const handleClear = () => {
    if (!persistedClause) {
      return;
    }
    void save(null);
  };

  if (!query) {
    return null;
  }

  return (
    <Card withBorder p="md" data-testid="table-default-filter-panel">
      <Stack gap="xs">
        <Group align="center" justify="space-between" gap="md">
          <Title order={4} fz="sm">
            {t`Default filter`}
          </Title>
          <Button
            size="xs"
            variant="subtle"
            disabled={saving || !persistedClause}
            onClick={handleClear}
          >
            {t`Clear filter`}
          </Button>
        </Group>
        <Text c="text-secondary" size="sm">
          {t`Applied when anyone opens this table. Users can edit or remove the filter in the Query Builder. This is a display default, not a permissions control.`}
        </Text>
        <SegmentFilterEditor
          query={query}
          onChange={handleChange}
          readOnly={saving}
        />
      </Stack>
    </Card>
  );
}
