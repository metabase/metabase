/* @flow weak */

import React, { Component, PropTypes } from "react";

import PivotByCategoryAction from "../actions/PivotByCategoryAction";

export default ({ card, tableMetadata, clicked }) => {
    return PivotByCategoryAction({ card, tableMetadata, clicked });
};
