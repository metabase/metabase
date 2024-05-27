import cx from "classnames";
import type { MouseEvent } from "react";
import { Fragment, useMemo } from "react";
import { t } from "ttag";

import EmptyState from "metabase/components/EmptyState";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import CS from "metabase/css/core/index.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";
import { formatValue, formatColumn } from "metabase/lib/formatting";
import ExpandableString from "metabase/query_builder/components/ExpandableString";
import { findColumnIndexesForColumnSettings } from "metabase-lib/v1/queries/utils/dataset";
import { TYPE } from "metabase-lib/v1/types/constants";
import {
  isa,
  isID,
  isImageURL,
  isAvatarURL,
} from "metabase-lib/v1/types/utils/isa";
import type { DatasetData, VisualizationSettings } from "metabase-types/api";

import {
  ObjectDetailsTable,
  GridContainer,
  GridCell,
  FitImage,
} from "./ObjectDetailsTable.styled";
import type { OnVisualizationClickType } from "./types";

export interface DetailsTableCellProps {
  column: any;
  value: any;
  isColumnName: boolean;
  settings: any;
  className?: string;
  onVisualizationClick: OnVisualizationClickType;
  visualizationIsClickable: (clicked: unknown) => boolean;
}

export function DetailsTableCell({
  column,
  value,
  isColumnName,
  settings,
  className = "",
  onVisualizationClick,
  visualizationIsClickable,
}: DetailsTableCellProps): JSX.Element {
  let cellValue;
  const clicked = { column: null, value: null };
  let isLink;

  const columnSettings = settings?.column?.(column) ?? {};
  const columnTitle =
    columnSettings?.["_column_title_full"] || formatColumn(column);

  if (isColumnName) {
    const title = column !== null ? columnTitle : null;
    cellValue = <Ellipsified lines={8}>{title}</Ellipsified>;
    clicked.column = column;
    isLink = false;
  } else {
    if (value === null || value === undefined || value === "") {
      cellValue = <span className={CS.textLight}>{t`Empty`}</span>;
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
        jsx: true,
        rich: true,
      });
      if (typeof cellValue === "string") {
        cellValue = <ExpandableString str={cellValue} length={140} />;
      }
    }
    clicked.column = column;
    clicked.value = value;
    isLink = isID(column);
  }

  const isClickable = onVisualizationClick != null;

  const isImage =
    !isColumnName &&
    (isImageURL(column) || isAvatarURL(column)) &&
    typeof value === "string" &&
    value.startsWith("http");

  const handleClick = (e: MouseEvent<HTMLSpanElement>) => {
    if (onVisualizationClick && visualizationIsClickable(clicked)) {
      onVisualizationClick({ ...clicked, element: e.currentTarget });
    }
  };

  return (
    <div>
      <span
        className={cx(
          {
            [CS.cursorPointer]: onVisualizationClick,
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
  data: DatasetData;
  zoomedRow: unknown[];
  settings: VisualizationSettings;
  onVisualizationClick: OnVisualizationClickType;
  visualizationIsClickable: (clicked: unknown) => boolean;
}

export function DetailsTable({
  data,
  zoomedRow,
  settings,
  onVisualizationClick,
  visualizationIsClickable,
}: DetailsTableProps): JSX.Element {
  const { cols: columns } = data;
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
                  className={cx(CS.textBold, CS.textMedium)}
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
                  className={cx(
                    CS.textBold,
                    CS.textDark,
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
