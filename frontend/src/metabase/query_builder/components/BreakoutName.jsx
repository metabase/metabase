import React from "react";

import type { Breakout as BreakoutT } from "metabase/meta/types/Query";
import Metadata from "metabase-lib/lib/metadata/Metadata";

import FieldName from "./FieldName.jsx";

type Props = {
  breakout: BreakoutT,
  query: any,
};

const BreakoutName = ({ breakout, query, ...props }) => (
  <FieldName field={breakout} query={query} {...props} />
);

export default BreakoutName;
