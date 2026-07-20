import cx from "classnames";
import { useCallback, useMemo } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { getSubpathSafeUrl } from "metabase/urls";
import * as DataGrid from "metabase/visualizations/lib/data_grid";
import {
  isPivoted as _isPivoted,
  getTitleForColumn,
} from "metabase/visualizations/lib/settings/column";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import { findColumnIndexesForColumnSettings } from "metabase-lib/v1/queries/utils/dataset";
import type { DatasetData, Series } from "metabase-types/api";

import { TableInteractive } from "../../components/TableInteractive";
import type { VisualizationProps } from "../../types";

import { TABLE_DEFINITION } from "./definition";

interface TableProps extends VisualizationProps {
  isShowingDetailsOnlyColumns?: boolean;
}

type TableData = Pick<
  DatasetData,
  "cols" | "rows" | "results_timezone" | "rows_truncated"
>;

function TableComponent(props: TableProps) {
  const {
    series,
    settings,
    metadata,
    isShowingDetailsOnlyColumns,
    isDashboard,
  } = props;

  const question = useSyncedQuestion(series, metadata);

  const data = useMemo<TableData>(() => {
    const [{ data }] = series;

    if (_isPivoted(series, settings)) {
      const pivotIndex = data.cols.findIndex(
        (col) => col.name === settings["table.pivot_column"],
      );
      const cellIndex = data.cols.findIndex(
        (col) => col.name === settings["table.cell_column"],
      );
      const normalIndex = data.cols.findIndex(
        (col, index) => index !== pivotIndex && index !== cellIndex,
      );
      return DataGrid.pivot(data, normalIndex, pivotIndex, cellIndex, settings);
    }

    const { cols, rows, results_timezone, rows_truncated } = data;
    const columnSettings = settings["table.columns"] ?? [];
    const columnIndexes = findColumnIndexesForColumnSettings(
      cols,
      columnSettings,
    ).filter(
      (columnIndex, settingIndex) =>
        columnIndex >= 0 &&
        (isShowingDetailsOnlyColumns ||
          (cols[columnIndex].visibility_type !== "details-only" &&
            columnSettings[settingIndex].enabled)),
    );

    return {
      cols: columnIndexes.map((i) => cols[i]),
      rows: rows.map((row) => columnIndexes.map((i) => row[i])),
      results_timezone,
      rows_truncated,
    };
  }, [series, settings, isShowingDetailsOnlyColumns]);

  const getColumnTitle = useCallback(
    (columnIndex: number) =>
      getTitleForColumn(data.cols[columnIndex], series, settings),
    [data, series, settings],
  );

  const getColumnSortDirection = useCallback(
    (columnIndex: number) => {
      const query = question.query();
      const stageIndex = -1;
      const column = Lib.findMatchingColumn(
        query,
        stageIndex,
        Lib.fromLegacyColumn(query, stageIndex, data.cols[columnIndex]),
        Lib.orderableColumns(query, stageIndex),
      );

      if (column != null) {
        const columnInfo = Lib.displayInfo(query, stageIndex, column);
        if (columnInfo.orderByPosition != null) {
          const orderBys = Lib.orderBys(query, stageIndex);
          const orderBy = orderBys[columnInfo.orderByPosition];
          const orderByInfo = Lib.displayInfo(query, stageIndex, orderBy);
          return orderByInfo.direction;
        }
      }
    },
    [question, data],
  );

  const isPivoted = _isPivoted(series, settings);
  const areAllColumnsHidden = data.cols.length === 0;

  if (areAllColumnsHidden) {
    return <AllFieldsHiddenMessage isDashboard={isDashboard} />;
  }

  return (
    <TableInteractive
      {...props}
      question={question}
      data={data}
      isPivoted={isPivoted}
      getColumnTitle={getColumnTitle}
      getColumnSortDirection={getColumnSortDirection}
    />
  );
}

/*
 * Constructs a Question that is in-sync with query results.
 * Reads metadata through a ref so async metadata updates don't recreate the
 * question (and rebuild every column) mid-interaction; series changes on every
 * query run, which is when fresh metadata actually needs to be picked up.
 */
function useSyncedQuestion(series: Series, metadata: Metadata | undefined) {
  const metadataRef = useLatest(metadata);
  return useMemo(() => {
    const [{ card }] = series;
    return new Question(card, metadataRef.current);
  }, [series, metadataRef]);
}

function AllFieldsHiddenMessage({ isDashboard }: { isDashboard: boolean }) {
  const allFieldsHiddenImageUrl = getSubpathSafeUrl(
    "app/assets/img/hidden-field.png",
  );
  const allFieldsHiddenImage2xUrl = getSubpathSafeUrl(
    "app/assets/img/hidden-field@2x.png",
  );

  return (
    <div
      className={cx(
        CS.flexFull,
        CS.px1,
        CS.pb1,
        CS.textCentered,
        CS.flex,
        CS.flexColumn,
        CS.layoutCentered,
        { [CS.textSlateLight]: isDashboard, [CS.textSlate]: !isDashboard },
      )}
    >
      <img
        data-testid="Table-all-fields-hidden-image"
        width={99}
        src={allFieldsHiddenImageUrl}
        srcSet={`
          ${allFieldsHiddenImageUrl}   1x,
          ${allFieldsHiddenImage2xUrl} 2x
        `}
        className={CS.mb2}
      />
      <span
        className={cx(CS.h4, CS.textBold)}
      >{t`Every field is hidden right now`}</span>
    </div>
  );
}

export const Table = Object.assign(TableComponent, TABLE_DEFINITION);
