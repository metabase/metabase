"use strict";

import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.react";


export default class CardFilters extends Component {

    render() {
        return (
            <div className="p2">
                <div className="text-brand">
                    <Icon className="inline-block" name={'filter'}></Icon> Filter saved questions
                </div>
            </div>
        );
    }
}
