/* eslint-disable react/prop-types */
import React from "react";
import { BreakoutFieldList } from "./BreakoutPopover.styled";

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
    <BreakoutFieldList
      className={className}
      width={width}
      field={breakout}
      query={query}
      metadata={query.metadata()}
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
