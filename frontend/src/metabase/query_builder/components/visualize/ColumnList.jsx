import React from "react";

import Icon from "metabase/components/Icon";

import { formatColumn } from "metabase/lib/formatting";
import { getIconForField } from "metabase/lib/schema_metadata";

import ColumnDragSource from "./dnd/ColumnDragSource";

const ColumnList = ({ style, className, query, rawSeries }) => {
  const cols = rawSeries ? rawSeries[0].data.cols : [];

  return (
    <div className={className} style={style}>
      <div className="bg-brand text-white p2 text-centered h3 mb2">{`Columns`}</div>
      <div>
        {cols.map(col => {
          return (
            <ColumnDragSource column={col}>
              <div className="mx2 mb2 p1 px2 bg-light rounded h4 text-medium flex align-center">
                <Icon name={getIconForField(col)} className="mr1" />
                {formatColumn(col)}
              </div>
            </ColumnDragSource>
          );
        })}
      </div>
    </div>
  );
};

export default ColumnList;
