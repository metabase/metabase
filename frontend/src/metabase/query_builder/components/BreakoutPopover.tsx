import React from "react";

import type { ConcreteFieldReference } from "metabase-types/api";
import type Breakout from "metabase-lib/queries/structured/Breakout";
import type DimensionOptions from "metabase-lib/DimensionOptions";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";

import { BreakoutFieldList } from "./BreakoutPopover.styled";

interface BreakoutPopoverProps {
  className?: string;
  query: StructuredQuery;
  breakout?: Breakout;
  breakoutOptions?: DimensionOptions;
  width?: number;
  maxHeight?: number;
  alwaysExpanded?: boolean;
  onChangeBreakout: (breakout: ConcreteFieldReference) => void;
  onClose?: () => void;
}

const BreakoutPopover = ({
  className,
  query,
  breakout,
  onChangeBreakout,
  breakoutOptions,
  onClose,
  maxHeight,
  alwaysExpanded,
  width = 400,
}: BreakoutPopoverProps) => {
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
      onFieldChange={(field: ConcreteFieldReference) => {
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default BreakoutPopover;
