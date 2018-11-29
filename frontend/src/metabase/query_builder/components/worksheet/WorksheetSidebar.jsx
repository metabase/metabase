import React from "react";

import FieldList from "../FieldList";
import DimensionDragSource from "./dnd/DimensionDragSource";

const WorksheetSidebar = ({ width, margin, query, onFieldClick }) => (
  <div className="absolute top bottom right" style={{ width }}>
    <div
      className="bordered rounded bg-white"
      style={{
        boxShadow: "0 2px 20px rgba(0,0,0,0.25)",
        margin: margin,
      }}
    >
      <FieldList
        className="text-brand"
        tableMetadata={query.tableMetadata()}
        fieldOptions={query.fieldOptions()}
        customFieldOptions={query.expressions()}
        width={width - 50}
        onFieldChange={onFieldClick}
        renderItemWrapper={(item, itemIndex, children) => (
          <DimensionDragSource dimension={item.dimension}>
            {children}
          </DimensionDragSource>
        )}
      />
    </div>
  </div>
);

export default WorksheetSidebar;
