import cx from "classnames";
import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import { EmptyState } from "metabase/common/components/EmptyState";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { Box, Checkbox, Icon } from "metabase/ui";
import { displayNameForColumn } from "metabase/utils/formatting";
import { registerVisualization } from "metabase/visualizations/index";
import { formatValue } from "metabase/visualizations/lib/formatting";
import { isColumnRightAligned } from "metabase/visualizations/lib/table";
import type {
  AuditTableSorting,
  ComputedVisualizationSettings,
  VisualizationDefinition,
} from "metabase/visualizations/types";
import { TABLE_DEFINITION } from "metabase/visualizations/visualizations/Table/definition";
import type { ClickObject } from "metabase-lib";
import type { DatasetColumn, RowValues, Series } from "metabase-types/api";

import S from "./AuditTableVisualization.module.css";

const ROW_ID_IDX = 0;

const getColumnName = (column: DatasetColumn) =>
  column.remapped_to || column.name;

// audit queries mark native query text columns with a custom `code` flag
type AuditDatasetColumn = DatasetColumn & {
  code?: boolean;
};

interface AuditTableVisualizationProps {
  series: Series;
  settings: ComputedVisualizationSettings;
  visualizationIsClickable: (clicked: ClickObject | null) => boolean;
  onVisualizationClick: (clicked: ClickObject | null) => void;
  isSortable?: boolean;
  sorting?: AuditTableSorting;
  onSortingChange?: (sorting: AuditTableSorting) => void;
  isSelectable?: boolean;
  rowChecked?: Record<string, boolean>;
  onAllSelectClick?: (event: { rows: RowValues[] }) => void;
  onRowSelectClick?: (event: { row: RowValues; rowIndex: number }) => void;
}

function AuditTableVisualizationInner({
  series,
  settings,
  visualizationIsClickable,
  onVisualizationClick,
  isSortable,
  sorting,
  onSortingChange,
  isSelectable,
  rowChecked = {},
  onAllSelectClick,
  onRowSelectClick,
}: AuditTableVisualizationProps) {
  const [
    {
      data: { cols, rows },
    },
  ] = series;

  const handleColumnHeaderClick = (column: DatasetColumn): void => {
    if (!isSortable || !onSortingChange) {
      return;
    }

    const columnName = getColumnName(column);

    onSortingChange({
      column: columnName,
      isAscending: columnName !== sorting?.column || !sorting?.isAscending,
    });
  };

  const tableColumnSettings = settings["table.columns"] ?? [];
  const columnIndexes = tableColumnSettings
    .filter(({ enabled }) => enabled)
    .map(({ name }) => cols.findIndex((col) => col.name === name));

  if (rows.length === 0) {
    return (
      <EmptyState
        title={t`No results`}
        illustrationElement={<img src={NoResults} />}
      />
    );
  }

  return (
    <table className={AdminS.ContentTable}>
      <thead>
        <tr>
          {isSelectable && (
            <th>
              <Checkbox
                size="sm"
                checked={Object.values(rowChecked).some((elem) => elem)}
                onChange={() => onAllSelectClick?.({ rows })}
              />
            </th>
          )}
          {columnIndexes.map((colIndex) => {
            const column = cols[colIndex];
            const columnName = getColumnName(column);
            const isSortedByColumn =
              sorting != null && sorting.column === columnName;

            return (
              <Box
                component="th"
                key={colIndex}
                className={cx(S.headerCell, {
                  [S.sortable]: isSortable,
                  [S.sortedByColumn]: isSortedByColumn,
                  [S.rightAligned]: isColumnRightAligned(column),
                })}
                onClick={() => handleColumnHeaderClick(column)}
              >
                {displayNameForColumn(column)}
                {isSortedByColumn && (
                  <Icon
                    className={CS.ml1}
                    name={sorting.isAscending ? "chevronup" : "chevrondown"}
                    size={10}
                  />
                )}
              </Box>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {isSelectable && (
              <td>
                <Checkbox
                  size="sm"
                  checked={rowChecked[String(row[ROW_ID_IDX])] ?? false}
                  onChange={() => onRowSelectClick?.({ row, rowIndex })}
                />
              </td>
            )}

            {columnIndexes.map((colIndex) => {
              const value = row[colIndex];
              const column: AuditDatasetColumn = cols[colIndex];
              const clicked: ClickObject = {
                column,
                value,
                origin: { row, cols },
              };
              const columnSettings = {
                ...settings.column?.(column),
                ...tableColumnSettings[colIndex],
              };

              const handleCellClick = () => {
                if (visualizationIsClickable(clicked)) {
                  onVisualizationClick(clicked);
                }
              };

              return (
                <Box
                  component="td"
                  key={colIndex}
                  className={cx(S.clickable, {
                    [S.rightAligned]: isColumnRightAligned(column),
                  })}
                  onClick={handleCellClick}
                >
                  <div
                    className={cx({
                      [cx(
                        CS.rounded,
                        CS.p1,
                        CS.textDark,
                        CS.textMonospace,
                        CS.textSmall,
                        CS.bgLight,
                      )]: column.code,
                    })}
                  >
                    {formatValue(value, {
                      ...columnSettings,
                      type: "cell",
                      jsx: true,
                      rich: true,
                      clicked: clicked,
                      // always show timestamps in local time for the audit app
                      local: true,
                    })}
                  </div>
                </Box>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const AuditTableVisualizationDef: VisualizationDefinition = {
  getUiName: () => "Audit Table",
  identifier: "audit-table",
  iconName: "table2",
  noHeader: true,
  hidden: true,
  // reuse Table's settings and columnSettings
  settings: TABLE_DEFINITION.settings,
  columnSettings: TABLE_DEFINITION.columnSettings,
  checkRenderable: () => {
    // audit table can always be rendered
  },
};

export const AuditTableVisualization = Object.assign(
  AuditTableVisualizationInner,
  AuditTableVisualizationDef,
);

registerVisualization(AuditTableVisualization);
