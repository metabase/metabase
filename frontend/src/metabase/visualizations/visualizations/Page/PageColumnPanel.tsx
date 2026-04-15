import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import { useTranslateContent } from "metabase/i18n/hooks";
import { FieldPanel } from "metabase/querying/fields/components/FieldPanel";
import { Box, Button } from "metabase/ui";
import type { EditWidgetData } from "metabase/visualizations/components/settings/ChartSettingTableColumns/types";
import { canEditQuery } from "metabase/visualizations/components/settings/ChartSettingTableColumns/utils";
import { ColumnItem } from "metabase/visualizations/components/settings/ColumnItem";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import { findColumnIndexesForColumnSettings } from "metabase-lib/v1/queries/utils/dataset";
import type {
  DatasetColumn,
  TableColumnOrderSetting,
} from "metabase-types/api";

/**
 * Props injected by the settings framework via the `getProps` defined in
 * the "table.columns" setting, plus `onShowWidget` injected by the sidebar.
 */
export type PageColumnPanelProps = {
  value: TableColumnOrderSetting[];
  columns: DatasetColumn[];
  question?: Question;
  isShowingDetailsOnlyColumns: boolean;
  getColumnName: (column: DatasetColumn) => string;
  onChange: (value: TableColumnOrderSetting[], question?: Question) => void;
  onShowWidget: (config: EditWidgetData, targetElement: HTMLElement) => void;
};

/**
 * Column list for the Page visualization settings panel.
 *
 * Shows the "Add or remove columns" button (when the query is editable) and
 * renders each column as a `ColumnItem` row with a type icon and a "⋯" popover
 * for per-column formatting — but without drag handles or show/hide toggles,
 * since the markdown template controls what appears and in what order.
 */
export function PageColumnPanel({
  value,
  columns,
  question,
  isShowingDetailsOnlyColumns,
  getColumnName,
  onChange,
  onShowWidget,
}: PageColumnPanelProps) {
  const tc = useTranslateContent();
  const query = question?.query();
  const hasEditButton = canEditQuery(query);
  const [isEditingQuery, setIsEditingQuery] = useState(false);

  const handleQueryChange = (newQuery: Lib.Query) => {
    onChange(value, question?.setQuery(newQuery));
  };

  const columnItems = useMemo(() => {
    const columnIndexes = findColumnIndexesForColumnSettings(columns, value);

    return value.reduce(
      (
        acc: Array<{
          column: DatasetColumn;
          icon: ReturnType<typeof getColumnIcon>;
        }>,
        _setting,
        settingIndex,
      ) => {
        const colIndex = columnIndexes[settingIndex];
        const column = columns[colIndex];
        if (!column) {
          return acc;
        }
        if (
          !isShowingDetailsOnlyColumns &&
          column.visibility_type === "details-only"
        ) {
          return acc;
        }
        acc.push({
          column: { ...column, display_name: tc(column.display_name) },
          icon: getColumnIcon(Lib.legacyColumnTypeInfo(column)),
        });
        return acc;
      },
      [],
    );
  }, [value, columns, isShowingDetailsOnlyColumns, tc]);

  const handleEdit = useCallback(
    (column: DatasetColumn, targetElement: HTMLElement) => {
      onShowWidget(
        { id: "column_settings", props: { initialKey: getColumnKey(column) } },
        targetElement,
      );
    },
    [onShowWidget],
  );

  return (
    <div>
      {hasEditButton && (
        <Button
          pl="0"
          variant="subtle"
          onClick={() => setIsEditingQuery((e) => !e)}
        >
          {isEditingQuery ? t`Done picking columns` : t`Add or remove columns`}
        </Button>
      )}
      {query != null && isEditingQuery ? (
        <FieldPanel
          query={query}
          stageIndex={-1}
          onChange={handleQueryChange}
        />
      ) : (
        <Box role="list" data-testid="page-column-panel">
          {columnItems.map(({ column, icon }) => (
            <ColumnItem
              key={column.name}
              title={getColumnName(column)}
              icon={icon}
              role="listitem"
              onEdit={(targetElement: HTMLElement) =>
                handleEdit(column, targetElement)
              }
            />
          ))}
        </Box>
      )}
    </div>
  );
}
