"use strict";

import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.react";

import { fetchRecents } from "../actions";


export default class RecentViews extends Component {

    constructor(props) {
        super(props);

        this.state = { error : null };
    }

    async componentDidMount() {
        try {
            await this.props.dispatch(fetchRecents());
        } catch (error) {
            this.setState({ error });
        }
    }

    render() {

        return (
            <div className="p2">
                <div className="text-brand clearfix pt2 pb2">
                    <Icon className="float-left" name={'history'} width={24} height={24}></Icon>
                    <div>Recents</div>
                </div>
                <div className="bordered rounded bg-white">
                    <ul>
                        <li>recent stuff</li>
                    </ul>
                </div>
            </div>
        );
    }
}
