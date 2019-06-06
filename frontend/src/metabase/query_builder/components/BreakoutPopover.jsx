/* @flow */

import React from "react";

import FieldList from "metabase/query_builder/components/FieldList.jsx";

import type { Breakout } from "metabase/meta/types/Query";
import type { FieldOptions } from "metabase/meta/types/Metadata";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

type Props = {
  breakout?: Breakout,
  onChangeBreakout: (breakout: Breakout) => void,
  query: StructuredQuery,
  breakoutOptions?: FieldOptions,
  onClose?: () => void,
  maxHeight?: number,
  alwaysExpanded?: boolean,
  searchable?: boolean,
  width?: number,
};

const BreakoutPopover = ({
  breakout,
  onChangeBreakout,
  query,
  breakoutOptions,
  onClose,
  maxHeight,
  alwaysExpanded,
  width = 400,
}: Props) => {
  const table = query.table();
  // FieldList requires table
  if (!table) {
    return null;
  }
  return (
    <FieldList
      className="text-green pl2"
      width={width}
      field={breakout}
      fieldOptions={breakoutOptions || query.breakoutOptions(breakout)}
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
