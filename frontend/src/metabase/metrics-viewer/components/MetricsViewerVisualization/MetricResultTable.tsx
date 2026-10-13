import { useState } from "react";
import { t } from "ttag";

import { Box, Button, Group, Stack, Text } from "metabase/ui";
import { formatValue } from "metabase/value-formatting";
import type { DatasetData } from "metabase-types/api";

import S from "./MetricResultTable.module.css";

const PAGE_SIZE = 50;

// Formula results don't necessarily have a corresponding MBQL aggregation clause.
// Render their returned columns directly instead of creating query-builder drill actions.
export function MetricResultTable({
  name,
  data,
}: {
  name: string;
  data: DatasetData;
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(data.rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const firstRow = (currentPage - 1) * PAGE_SIZE;
  return (
    <Stack gap="sm" flex={1} mih="15rem">
      <Text fw="bold">{name}</Text>
      <Box style={{ overflow: "auto" }} flex={1}>
        <table aria-label={name} className={S.table}>
          <thead>
            <tr>
              {data.cols.map((column, index) => (
                <th key={index}>{column.display_name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows
              .slice(firstRow, firstRow + PAGE_SIZE)
              .map((row, rowIndex) => (
                <tr key={firstRow + rowIndex}>
                  {data.cols.map((column, index) => (
                    <td key={index}>{formatValue(row[index], { column })}</td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </Box>
      {totalPages > 1 && (
        <Group justify="space-between">
          <Text size="sm">{t`${data.rows.length} rows`}</Text>
          <Group gap="sm">
            <Button
              size="compact-sm"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >{t`Previous`}</Button>
            <Text size="sm">{t`Page ${currentPage} of ${totalPages}`}</Text>
            <Button
              size="compact-sm"
              disabled={currentPage === totalPages}
              onClick={() => setPage(currentPage + 1)}
            >{t`Next`}</Button>
          </Group>
        </Group>
      )}
    </Stack>
  );
}
