/* @flow */

import React from "react";

import AggPopover from "metabase/query_builder/components/AggregationPopover";

import type { Aggregation, ExpressionName } from "metabase/meta/types/Query";
import type { TableMetadata } from "metabase/meta/types/Metadata";

type Props = {
  aggregation?: Aggregation,
  tableMetadata: TableMetadata,
  customFields: { [key: ExpressionName]: any },
  onCommitAggregation: (aggregation: Aggregation) => void,
  onClose?: () => void,
  availableAggregations: [Aggregation],
  showOnlyProvidedAggregations: boolean,
};

const AggregationPopover = (props: Props) => (
  <AggPopover {...props} aggregation={props.aggregation || []} />
);

export default AggregationPopover;
