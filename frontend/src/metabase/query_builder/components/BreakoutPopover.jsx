/* @flow */

import React from "react";

import FieldList from "metabase/query_builder/components/FieldList.jsx";

import type { Breakout } from "metabase/meta/types/Query";
import type { TableMetadata, FieldOptions } from "metabase/meta/types/Metadata";

type Props = {
  maxHeight?: number,
  breakout?: Breakout,
  query?: Query,
  tableMetadata?: TableMetadata,
  breakoutOptions?: FieldOptions,
  onCommitBreakout: (breakout: Breakout) => void,
  onClose?: () => void,
  alwaysExpanded?: boolean,
};

const BreakoutPopover = ({
  breakout,
  query,
  tableMetadata = query.tableMetadata(),
  breakoutOptions = query.breakoutOptions(),
  onCommitBreakout,
  onClose,
  maxHeight,
  alwaysExpanded,
}: Props) => (
  <FieldList
    className="text-green"
    maxHeight={maxHeight}
    tableMetadata={tableMetadata}
    field={breakout}
    fieldOptions={breakoutOptions}
    onFieldChange={field => {
      onCommitBreakout(field);
      if (onClose) {
        onClose();
      }
    }}
    enableSubDimensions
    alwaysExpanded={alwaysExpanded}
  />
);

export default BreakoutPopover;
