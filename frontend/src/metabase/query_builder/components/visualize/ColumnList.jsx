import React from "react";

import Icon from "metabase/components/Icon";

import { formatColumn } from "metabase/lib/formatting";
import { getIconForField } from "metabase/lib/schema_metadata";

import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";

import ColumnDragSource from "./dnd/ColumnDragSource";

const ColumnList = ({ style, className, query, rawSeries }) => {
  const computedSettings = rawSeries
    ? getComputedSettingsForSeries(rawSeries)
    : {};
  const cols = computedSettings["_column_list"] || [];

  return (
    <div className={className} style={style}>
      <div>
        {!rawSeries ? (
          <div className="mb2 text-centered">Loading...</div>
        ) : cols.length === 0 ? (
          <div className="mb2 text-centered">No columns left</div>
        ) : (
          cols.map(col => {
            return (
              <ColumnDragSource column={col}>
                <div className="mx2 mb2 p1 px2 bg-light rounded h4 text-medium flex align-center">
                  <Icon name={getIconForField(col)} className="mr1" />
                  {formatColumn(col)}
                </div>
              </ColumnDragSource>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ColumnList;
