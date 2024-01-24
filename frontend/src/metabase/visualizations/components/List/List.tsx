import DataGrid from "react-data-grid";
import { useState } from "react";
import type { FunctionComponent } from "react";
import { Checkbox, Icon } from "metabase/ui";

import { pickRenderer } from "../TableInteractive/utils";
import { renderHeader } from "../TableInteractive/renderers";

function prepareColumns(cols, setCols) {
  return [
    {
      key: "select",
      width: "max-content",
      renderCell: () => (
        <div className="flex align-center justify-center full-height">
          <Checkbox />
        </div>
      ),
    },
    ...cols.map(c => {
      return {
        ...c,
        key: c.name,
        name: c.display_name,
        width: c.position === 0 ? "max-content" : null,
        renderCell: pickRenderer(c) || (({ row }) => String(row[c.position])),
        renderHeaderCell: renderHeader,
        forcedDisplay: "default",
        columns: cols,
        setCols,
      };
    }),
    {
      key: "actions",
      width: "max-content",
      renderCell: () => (
        <div className="flex align-center justify-center full-height">
          <Icon name="ellipsis" />
        </div>
      ),
    },
  ];
}

type ListProps = {
  data: { rows: Array<any>; cols: Array<any> };
  height: number;
};

export const List: FunctionComponent<ListProps> = ({ data, height }) => {
  const { rows, cols } = data;

  const [stateCols, setCols] = useState(cols);

  const columns = prepareColumns(stateCols, setCols);
  return (
    <div className="ListGrid p2">
      <DataGrid
        rows={rows}
        columns={columns}
        style={{ height }}
        rowHeight={32}
      />
    </div>
  );
};
