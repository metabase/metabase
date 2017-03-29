/* @flow weak */

import React, { Component, PropTypes } from "react";

import AggPopover from "metabase/query_builder/components/AggregationPopover";

const AggregationPopover = props => (
    <AggPopover {...props} aggregation={props.aggregation || []} />
);

export default AggregationPopover;
