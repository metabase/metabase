import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { useUpdateTableMutation } from "metabase/api";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Card, NumberInput, Stack } from "metabase/ui";
import type { Table } from "metabase-types/api";

const DEBOUNCE_MS = 400;
/**
 * Upper bound for the admin-set default row limit. Chosen to prevent obvious
 * foot-guns (typing a long number, pasting a huge value). The server does not
 * enforce this; it's purely a client sanity cap.
 */
const MAX_ROW_LIMIT = 2_000_000;

interface Props {
  table: Table;
}

export function TableDefaultsPanel({ table }: Props) {
  const [updateTable] = useUpdateTableMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();

  const persisted = table.settings?.default_row_limit ?? null;
  const [value, setValue] = useState<number | null>(persisted);
  const [saving, setSaving] = useState(false);

  // Single-flight + out-of-order guard. Each dispatched save claims a seq id;
  // only the most recent seq is allowed to mutate UI state on completion.
  const seqRef = useRef(0);
  // Only refresh local state when we switch to a different table, not when
  // `persisted` changes as a consequence of our own save (that would clobber
  // in-flight edits).
  const tableIdRef = useRef(table.id);

  useEffect(() => {
    if (tableIdRef.current !== table.id) {
      tableIdRef.current = table.id;
      setValue(persisted);
    }
  }, [table.id, persisted]);

  useEffect(() => {
    if (value === persisted) {
      return;
    }
    const handle = setTimeout(async () => {
      const mySeq = ++seqRef.current;
      const prevSnapshot = persisted;
      const nextValue = value;
      setSaving(true);
      const { error } = await updateTable({
        id: table.id,
        settings: { default_row_limit: nextValue },
      });
      if (seqRef.current !== mySeq) {
        // Superseded by a newer save; newer save will reset `saving` itself.
        return;
      }
      setSaving(false);
      if (error) {
        sendErrorToast(t`Failed to update default row limit`);
        setValue(prevSnapshot);
        return;
      }
      sendSuccessToast(t`Default row limit updated`, async () => {
        const { error: undoErr } = await updateTable({
          id: table.id,
          settings: { default_row_limit: prevSnapshot },
        });
        sendUndoToast(undoErr);
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, persisted, table.id]);

  return (
    <Card withBorder p="md" data-testid="table-defaults-panel">
      <Stack gap="xs">
        <NumberInput
          label={t`Default row limit`}
          description={t`When anyone opens this table, cap the initial query at this many rows. Users can change or clear the limit in the Query Builder.`}
          value={value ?? ""}
          min={1}
          max={MAX_ROW_LIMIT}
          placeholder={t`No limit`}
          disabled={saving}
          onChange={(v) => setValue(typeof v === "number" ? v : null)}
        />
      </Stack>
    </Card>
  );
}
