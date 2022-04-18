import React from "react";
import cx from "classnames";
import { t } from "ttag";

import { DatasetData } from "metabase-types/types/Dataset";
import { OnVisualizationClickType } from "./types";

import ExpandableString from "metabase/query_builder/components/ExpandableString";
import { isID } from "metabase/lib/schema_metadata";
import { TYPE, isa } from "metabase/lib/types";
import { formatValue, formatColumn } from "metabase/lib/formatting";

export interface DetailsTableCellProps {
  column: any;
  value: any;
  isColumnName: boolean;
  settings: any;
  onVisualizationClick: OnVisualizationClickType;
  visualizationIsClickable: (clicked: unknown) => boolean;
}

export function DetailsTableCell({
  column,
  value,
  isColumnName,
  settings,
  onVisualizationClick,
  visualizationIsClickable,
}: DetailsTableCellProps): JSX.Element {
  let cellValue;
  const clicked = { column: null, value: null };
  let isLink;

  if (isColumnName) {
    cellValue = column !== null ? formatColumn(column) : null;
    clicked.column = column;
    isLink = false;
  } else {
    if (value === null || value === undefined || value === "") {
      cellValue = <span className="text-light">{t`Empty`}</span>;
    } else if (isa(column.semantic_type, TYPE.SerializedJSON)) {
      let formattedJson;
      try {
        formattedJson = JSON.stringify(JSON.parse(value), null, 2);
      } catch (e) {
        formattedJson = value;
      }
      cellValue = <pre className="ObjectJSON">{formattedJson}</pre>;
    } else if (typeof value === "object") {
      const formattedJson = JSON.stringify(value, null, 2);
      cellValue = <pre className="ObjectJSON">{formattedJson}</pre>;
    } else {
      cellValue = formatValue(value, {
        ...settings.column(column),
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

  const isClickable = onVisualizationClick && visualizationIsClickable(clicked);

  return (
    <div>
      <span
        className={cx({
          "cursor-pointer": isClickable,
          link: isClickable && isLink,
        })}
        onClick={
          isClickable
            ? e => {
                onVisualizationClick({ ...clicked, element: e.currentTarget });
              }
            : undefined
        }
      >
        {cellValue}
      </span>
    </div>
  );
}

export interface DetailsTableProps {
  data: DatasetData;
  zoomedRow: unknown[] | undefined;
  settings: unknown;
  onVisualizationClick: OnVisualizationClickType;
  visualizationIsClickable: (clicked: any) => boolean;
}

export function DetailsTable({
  data,
  zoomedRow,
  settings,
  onVisualizationClick,
  visualizationIsClickable,
}: DetailsTableProps): JSX.Element {
  const { rows, cols } = data;
  const row = zoomedRow || rows[0];

  return (
    <>
      {cols.map((column, columnIndex) => (
        <div className="Grid Grid--1of2 mb2" key={columnIndex}>
          <div className="Grid-cell">
            <DetailsTableCell
              column={column}
              value={row[columnIndex]}
              isColumnName
              settings={settings}
              onVisualizationClick={onVisualizationClick}
              visualizationIsClickable={visualizationIsClickable}
            />
          </div>
          <div
            style={{ wordWrap: "break-word" }}
            className="Grid-cell text-bold text-dark"
          >
            <DetailsTableCell
              column={column}
              value={row[columnIndex]}
              isColumnName={false}
              settings={settings}
              onVisualizationClick={onVisualizationClick}
              visualizationIsClickable={visualizationIsClickable}
            />
          </div>
        </div>
      ))}
    </>
  );
}
