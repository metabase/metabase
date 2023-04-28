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
  const fieldOptions = breakoutOptions || query.breakoutOptions(breakout);

  return (
    <BreakoutFieldList
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
      // forward AccordionList props
      className={className}
      maxHeight={maxHeight}
      width={width}
      alwaysExpanded={alwaysExpanded}
      // forward DimensionList props
      enableSubDimensions
    />
  );
};

export default BreakoutPopover;
