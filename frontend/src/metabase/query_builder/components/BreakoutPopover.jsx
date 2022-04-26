/* eslint-disable react/prop-types */
import React from "react";
import cx from "classnames";

import FieldList from "metabase/query_builder/components/FieldList";

const BreakoutPopover = ({
  className,
  breakout,
  onChangeBreakout,
  query,
  breakoutOptions,
  onClose,
  maxHeight,
  alwaysExpanded,
  width = 400,
}) => {
  const table = query.table();
  // FieldList requires table
  if (!table) {
    return null;
  }

  const fieldOptions = breakoutOptions || query.breakoutOptions(breakout);

  return (
    <FieldList
      className={cx(className, "text-green")}
      width={width}
      field={breakout}
      fieldOptions={fieldOptions}
      onFieldChange={field => {
        onChangeBreakout(field);
        if (onClose) {
          onClose();
        }
      }}
      table={table}
      enableSubDimensions
      maxHeight={maxHeight}
      alwaysExpanded={alwaysExpanded}
      searchable={false}
    />
  );
};

export default BreakoutPopover;
