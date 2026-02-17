import cx from "classnames";
import type { MouseEvent } from "react";
import { Fragment, useMemo } from "react";
import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { EmptyState } from "metabase/common/components/EmptyState";
import CS from "metabase/css/core/index.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";
import { displayNameForColumn, formatValue } from "metabase/lib/formatting";
import { ExpandableString } from "metabase/query_builder/components/ExpandableString";
import type { ClickObject } from "metabase-lib";
import { findColumnIndexesForColumnSettings } from "metabase-lib/v1/queries/utils/dataset";
import { TYPE } from "metabase-lib/v1/types/constants";
import {
  isAvatarURL,
  isID,
  isImageURL,
  isa,
} from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  RowValue,
  VisualizationSettings,
} from "metabase-types/api";

import {
  FitImage,
  GridCell,
  GridContainer,
  ObjectDetailsTable,
} from "./ObjectDetailsTable.styled";
import type { OnVisualizationClickType } from "./types";

export interface DetailsTableCellProps {
  column: any;
  value: any;
  isColumnName: boolean;
  settings: any;
  className?: string;
  clicked?: ClickObject;
  onVisualizationClick: OnVisualizationClickType;
  visualizationIsClickable: (clicked: unknown) => boolean;
}

export function DetailsTableCell({
  column,
  value,
  isColumnName,
  settings,
  clicked,
  className = "",
  onVisualizationClick,
  visualizationIsClickable,
}: DetailsTableCellProps): JSX.Element {
  let cellValue;
  let isLink;

  const columnSettings = settings?.column?.(column) ?? {};
  const columnTitle =
    columnSettings?.["_column_title_full"] || displayNameForColumn(column);

  if (isColumnName) {
    const title = column !== null ? columnTitle : null;
    cellValue = <Ellipsified lines={8}>{title}</Ellipsified>;
    isLink = false;
  } else {
    if (value === null || value === undefined || value === "") {
      cellValue = <span className={CS.textTertiary}>{t`Empty`}</span>;
    } else if (isa(column.semantic_type, TYPE.SerializedJSON)) {
      let formattedJson;
      try {
        formattedJson = JSON.stringify(JSON.parse(value), null, 2);
      } catch (e) {
        formattedJson = value;
      }
      cellValue = (
        <pre className={QueryBuilderS.ObjectJSON}>{formattedJson}</pre>
      );
    } else if (typeof value === "object") {
      const formattedJson = JSON.stringify(value, null, 2);
      cellValue = (
        <pre className={QueryBuilderS.ObjectJSON}>{formattedJson}</pre>
      );
    } else {
      cellValue = formatValue(value, {
        ...columnSettings,
        clicked,
        jsx: true,
        rich: true,
      });
      if (typeof cellValue === "string") {
        cellValue = <ExpandableString str={cellValue} length={140} />;
      }
    }
    isLink = isID(column);
  }

  const isClickable = onVisualizationClick != null;

  const isImage =
    !isColumnName &&
    (isImageURL(column) || isAvatarURL(column)) &&
    typeof value === "string" &&
    value.startsWith("http");

  const handleClick = (e: MouseEvent<HTMLSpanElement>) => {
    const clickData = { ...clicked, element: e.currentTarget };
    if (onVisualizationClick && visualizationIsClickable(clickData)) {
      onVisualizationClick(clickData);
    }
  };

  return (
    <div data-testid="object-details-table-cell">
      <span
        className={cx(
          {
            link: isClickable && isLink,
          },
          className,
        )}
        onClick={handleClick}
      >
        {cellValue}
      </span>
      {isImage && (
        <div>
          <FitImage src={value} alt={value} />
        </div>
      )}
    </div>
  );
}

export interface DetailsTableProps {
  columns: DatasetColumn[];
  zoomedRow: RowValue[];
  settings: VisualizationSettings;
  onVisualizationClick: OnVisualizationClickType;
  visualizationIsClickable: (clicked: unknown) => boolean;
}

export function DetailsTable({
  columns,
  zoomedRow,
  settings,
  onVisualizationClick,
  visualizationIsClickable,
}: DetailsTableProps): JSX.Element {
  const columnSettings = settings["table.columns"];

  const { cols, row } = useMemo(() => {
    if (!columnSettings) {
      return { cols: columns, row: zoomedRow };
    }

    const columnIndexes = findColumnIndexesForColumnSettings(
      columns,
      columnSettings.filter(({ enabled }) => enabled),
    ).filter((columnIndex: number) => columnIndex >= 0);

    return {
      cols: columnIndexes.map((i: number) => columns[i]),
      row: columnIndexes.map((i: number) => zoomedRow[i]),
    };
  }, [columnSettings, columns, zoomedRow]);

  const clickedData = useMemo(
    () => row.map((value, i) => ({ value, col: cols[i] })),
    [cols, row],
  );

  if (!cols?.length) {
    return (
      <EmptyState message={t`Select at least one column`} className={CS.p3} />
    );
  }

  if (!row?.length) {
    return <EmptyState message={t`No details found`} className={CS.p3} />;
  }

  return (
    <ObjectDetailsTable>
      <GridContainer cols={3}>
        {cols.map((column, columnIndex) => {
          const columnValue = row[columnIndex];

          return (
            <Fragment key={columnIndex}>
              <GridCell>
                <DetailsTableCell
                  column={column}
                  value={row[columnIndex] ?? t`Empty`}
                  isColumnName
                  settings={settings}
                  className={cx(CS.textBold, CS.textSecondary)}
                  onVisualizationClick={onVisualizationClick}
                  visualizationIsClickable={visualizationIsClickable}
                />
              </GridCell>
              <GridCell colSpan={2}>
                <DetailsTableCell
                  column={column}
                  value={columnValue}
                  isColumnName={false}
                  settings={settings}
                  clicked={{
                    value: columnValue,
                    column,
                    settings,
                    origin: { row, cols },
                    data: clickedData,
                  }}
                  className={cx(
                    CS.textBold,
                    CS.textPrimary,
                    CS.textSpaced,
                    CS.textWrap,
                  )}
                  onVisualizationClick={onVisualizationClick}
                  visualizationIsClickable={visualizationIsClickable}
                />
              </GridCell>
            </Fragment>
          );
        })}
      </GridContainer>
    </ObjectDetailsTable>
  );
}
