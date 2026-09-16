import { t } from "ttag";

import { ClientSortableTable } from "metabase/common/components/Table";
import type { ColumnItem } from "metabase/common/components/Table/types";
import { Badge, Text, Tooltip } from "metabase/ui";

import {
  type DataSensitivityRow,
  getStatusColor,
  getStatusLabel,
  getStatusSortRank,
} from "./utils";

type Column = ColumnItem & {
  key: keyof DataSensitivityRow;
  sortValue?: (row: DataSensitivityRow) => string | number;
};

const COLUMNS: Column[] = [
  {
    key: "table",
    get name() {
      return t`Table`;
    },
  },
  {
    key: "field",
    get name() {
      return t`Field`;
    },
  },
  {
    key: "current",
    get name() {
      return t`Current label`;
    },
  },
  {
    key: "proposed",
    get name() {
      return t`Proposed label`;
    },
  },
  {
    key: "confidence",
    get name() {
      return t`Confidence`;
    },
  },
  {
    key: "semanticType",
    get name() {
      return t`Proposed semantic type`;
    },
  },
  {
    key: "status",
    get name() {
      return t`Status`;
    },
    sortValue: (row) => getStatusSortRank(row.status),
  },
];

function formatValueForSorting(row: DataSensitivityRow, columnName: string) {
  const column = COLUMNS.find((column) => column.key === columnName);
  if (!column) {
    return "";
  }
  return column.sortValue ? column.sortValue(row) : row[column.key];
}

export function DataSensitivityResultsTable({
  rows,
}: {
  rows: DataSensitivityRow[];
}) {
  return (
    <ClientSortableTable
      columns={COLUMNS}
      rows={rows}
      defaultSortColumn="status"
      defaultSortDirection="asc"
      formatValueForSorting={formatValueForSorting}
      rowRenderer={(row) => <DataSensitivityResultsRow row={row} />}
      emptyBody={<Text c="text-secondary">{t`No fields to show.`}</Text>}
      data-testid="data-sensitivity-results-table"
    />
  );
}

function DataSensitivityResultsRow({ row }: { row: DataSensitivityRow }) {
  return (
    <tr>
      <td>{row.table}</td>
      <td>{row.field}</td>
      <td>
        {row.current}
        {row.humanSet && (
          <Text component="span" c="text-secondary" ml="xs">
            {t`(set by a person)`}
          </Text>
        )}
      </td>
      <td>
        <Tooltip label={row.reasoning} disabled={!row.reasoning} multiline>
          <span>{row.proposed}</span>
        </Tooltip>
      </td>
      <td>{row.confidence}</td>
      <td>{row.semanticType}</td>
      <td>
        <Badge color={getStatusColor(row.status)} variant="light">
          {getStatusLabel(row.status)}
        </Badge>
      </td>
    </tr>
  );
}
