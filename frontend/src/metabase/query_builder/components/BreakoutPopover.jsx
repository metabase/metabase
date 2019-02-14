/* @flow */

import React from "react";

import FieldList from "metabase/query_builder/components/FieldList.jsx";

import type { Breakout } from "metabase/meta/types/Query";
import type { FieldOptions } from "metabase/meta/types/Metadata";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

type Props = {
  breakout?: Breakout,
  onCommitBreakout: (breakout: Breakout) => void,
  query: StructuredQuery,
  breakoutOptions?: FieldOptions,
  onClose?: () => void,
  maxHeight?: number,
  alwaysExpanded?: boolean,
};

const BreakoutPopover = ({
  breakout,
  onCommitBreakout,
  query,
  breakoutOptions,
  onClose,
  maxHeight,
  alwaysExpanded,
}: Props) => {
  const table = query.table();
  // FieldList requires table
  if (!table) {
    return null;
  }
  return (
    <FieldList
      className="text-green"
      maxHeight={maxHeight}
      field={breakout}
      fieldOptions={breakoutOptions || query.breakoutOptions()}
      onFieldChange={field => {
        onCommitBreakout(field);
        if (onClose) {
          onClose();
        }
      }}
      table={table}
      enableSubDimensions
      alwaysExpanded={alwaysExpanded}
    />
  );
};

export default BreakoutPopover;
