/* @flow */

import React from "react";
import cx from "classnames";

import FieldList from "metabase/query_builder/components/FieldList";

import type { Breakout } from "metabase-types/types/Query";
import type { FieldOptions } from "metabase-types/types/Metadata";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

type Props = {
  className?: string,
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
  className,
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
      className={cx(className, "text-green")}
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
