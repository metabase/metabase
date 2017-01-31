/* @flow */

import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import PublicNotFound from "metabase/public/components/PublicNotFound";

type Props = {
    children: any,
    errorPage?: { status: number }
};

const mapStateToProps = (state, props) => ({
    errorPage: state.app.errorPage
});

@connect(mapStateToProps)
export default class PublicApp extends Component<*, Props, *> {
    render() {
        const { children, errorPage } = this.props;
        if (errorPage) {
            return <PublicNotFound />;
        } else {
            return children;
        }
    }
}
