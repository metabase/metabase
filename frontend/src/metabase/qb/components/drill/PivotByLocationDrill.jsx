/* @flow */

import React, { Component } from "react";
import PropTypes from "prop-types";

import PivotByLocationAction from "../actions/PivotByLocationAction";

import type {
    ClickAction,
    ClickActionProps
} from "metabase/meta/types/Visualization";

export default (
    { card, tableMetadata, clicked }: ClickActionProps
): ?ClickAction => {
    return PivotByLocationAction({ card, tableMetadata, clicked });
};
