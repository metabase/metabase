/* @flow */
import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import ShareWidget from "metabase/public/components/widgets/ShareWidget";

import { createPublicLink, deletePublicLink } from "../dashboard";

const mapDispatchToProps = {
    createPublicLink,
    deletePublicLink
}

@connect(null, mapDispatchToProps)
export default class DashboardShareWidget extends Component {
    render() {
        const { className, dashboard, createPublicLink, deletePublicLink, ...props } = this.props;
        return (
            <ShareWidget
                {...props}
                className={className}
                type="dashboard"
                uuid={dashboard.public_uuid}
                onCreate={() => createPublicLink(dashboard)}
                onDisable={() => deletePublicLink(dashboard)}
            />
        );
    }
}
