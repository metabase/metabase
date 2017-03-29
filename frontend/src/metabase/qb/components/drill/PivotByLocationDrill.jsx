/* @flow weak */

import React, { Component, PropTypes } from "react";

import PivotByLocationAction from "../actions/PivotByLocationAction";

export default ({ card, tableMetadata, clicked }) => {
    return PivotByLocationAction({ card, tableMetadata, clicked });
};
