/* @flow */

import React from "react";

import type { Breakout } from "metabase/meta/types/Query";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

import FieldName from "./FieldName.jsx";

type Props = {
  breakout: Breakout,
  query: StructuredQuery,
};

const BreakoutName = ({ breakout, query, ...props }: Props) => (
  <FieldName field={breakout} query={query} {...props} />
);

export default BreakoutName;
