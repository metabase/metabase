import { useMemo, useState } from "react";
import { t } from "ttag";

import { Modal, type ModalProps, Stack, Switch, Text } from "metabase/ui";
import type { DataSensitivityDatabaseResult } from "metabase-types/api";

import { DataSensitivityResultsTable } from "./DataSensitivityResultsTable";
import {
  getDataSensitivityRows,
  getTableErrors,
  getTableResults,
} from "./utils";

export function DataSensitivityResultsModal({
  result,
  opened,
  onClose,
}: Pick<ModalProps, "opened" | "onClose"> & {
  result: DataSensitivityDatabaseResult;
}) {
  const [showDifferencesOnly, setShowDifferencesOnly] = useState(true);
  const tables = useMemo(() => getTableResults(result), [result]);
  const errors = useMemo(() => getTableErrors(result), [result]);
  const rows = useMemo(() => getDataSensitivityRows(tables), [tables]);
  const visibleRows = showDifferencesOnly
    ? rows.filter((row) => row.status !== "agree")
    : rows;

  const { counts, usage, requests } = result;
  const model = tables[0]?.model;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t`Sensitive data scan results`}
      size="xl"
      data-testid="data-sensitivity-results-modal"
    >
      <Stack gap="md">
        <Text>
          {t`${counts.fields} fields scanned across ${tables.length} tables: ${counts.new} new, ${counts.disagree} differ from the current label, ${counts.agree} agree.`}
        </Text>
        <Text c="text-secondary">
          {t`Nothing has been changed. Review the proposals and set labels in Table Metadata.`}
        </Text>
        <Switch
          label={t`Only show differences`}
          checked={showDifferencesOnly}
          onChange={(event) =>
            setShowDifferencesOnly(event.currentTarget.checked)
          }
        />
        <DataSensitivityResultsTable rows={visibleRows} />
        {errors.length > 0 && (
          <Stack gap="xs">
            <Text fw="bold">{t`Tables that could not be scanned`}</Text>
            {errors.map((error) => (
              <Text key={error.table_id} c="error">
                {error.table_name}: {error.error}
              </Text>
            ))}
          </Stack>
        )}
        <Text size="sm" c="text-secondary">
          {model
            ? t`${requests} requests to ${model}, ${usage.input_tokens} input tokens, ${usage.output_tokens} output tokens.`
            : t`${requests} requests, ${usage.input_tokens} input tokens, ${usage.output_tokens} output tokens.`}
        </Text>
      </Stack>
    </Modal>
  );
}
