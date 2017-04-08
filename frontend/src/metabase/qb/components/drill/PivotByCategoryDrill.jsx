/* @flow */

import React, { Component } from "react";
import PropTypes from "prop-types";

import PivotByCategoryAction from "../actions/PivotByCategoryAction";

import type {
    ClickAction,
    ClickActionProps
} from "metabase/meta/types/Visualization";

export default (
    { card, tableMetadata, clicked }: ClickActionProps
): ?ClickAction => {
    return PivotByCategoryAction({ card, tableMetadata, clicked });
};
