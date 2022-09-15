/* eslint-disable react/prop-types */
import React from "react";

import { Field } from "metabase-types/types/Field";
import DimensionOptions from "metabase-lib/lib/DimensionOptions";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

import { BreakoutFieldList } from "./BreakoutPopover.styled";

type Props = {
  className?: string;
  breakout?: Field;
  onChangeBreakout: (value: Field) => void;
  query: StructuredQuery;
  breakoutOptions: DimensionOptions;
  onClose: () => void;
  maxHeight?: number;
  alwaysExpanded?: boolean;
  width?: number;
};

const BreakoutPopover: React.FC<Props> = ({
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
      onFieldChange={(field: Field) => {
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
