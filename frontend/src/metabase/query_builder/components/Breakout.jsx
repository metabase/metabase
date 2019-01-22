import React from "react";

import type { Breakout as BreakoutT } from "metabase/meta/types/Query";
import Metadata from "metabase-lib/lib/metadata/Metadata";

import FieldName from "./FieldName.jsx";

type Props = {
  breakout: BreakoutT,
  query: any,
};

const Breakout = ({ breakout, query, ...props }) => (
  <FieldName
    field={breakout}
    tableMetadata={query.tableMetadata()}
    query={query}
    {...props}
  />
);

export default Breakout;
