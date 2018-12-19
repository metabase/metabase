import React from "react";

import cx from "classnames";

import Icon from "metabase/components/Icon";

import { formatColumn } from "metabase/lib/formatting";
import { getIconForField } from "metabase/lib/schema_metadata";

import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";

import ColumnDragSource from "./dnd/ColumnDragSource";

const ColumnList = ({ style, className, query, rawSeries }) => {
  if (!rawSeries) {
    return (
      <div style={style} className={cx(className, "text-centered")}>
        Loading...
      </div>
    );
  }

  if (query.isBareRows()) {
    const computedSettings = rawSeries
      ? getComputedSettingsForSeries(rawSeries)
      : {};
    const cols = computedSettings["_column_list"] || [];
    return (
      <div className={className} style={style}>
        {cols.map(col => (
          <ColumnDragSource column={col}>
            <div className="mx2 mb2 p1 px2 bg-light rounded h4 text-medium flex align-center">
              <Icon name={getIconForField(col)} className="mr1" />
              {formatColumn(col)}
            </div>
          </ColumnDragSource>
        ))}
      </div>
    );
  } else {
    const dimensionOptions = query.dimensionOptions();
    return (
      <div className={className} style={style}>
        {dimensionOptions.dimensions.map(dimension => (
          <ColumnDragSource dimension={dimension}>
            <div className="mx2 mb2 p1 px2 bg-light rounded h4 text-medium flex align-center">
              <Icon name={dimension.field().icon()} className="mr1" />
              {dimension.displayName()}
            </div>
          </ColumnDragSource>
        ))}
      </div>
    );
  }
};

export default ColumnList;
