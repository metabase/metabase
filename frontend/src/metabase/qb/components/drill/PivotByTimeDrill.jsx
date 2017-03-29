/* @flow weak */

import React, { Component, PropTypes } from "react";

import PivotByTimeAction from "../actions/PivotByTimeAction";

export default ({ card, tableMetadata, clicked }) => {
    return PivotByTimeAction({ card, tableMetadata, clicked });
};
