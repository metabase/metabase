import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import MetabaseAnalytics from "metabase/lib/analytics";

import { selectors } from "../selectors";
import * as actions from "../actions";
import VirtualTableEditor from "../components/VirtualTableEditor.jsx";


@connect(selectors, actions)
export default class VirtualTableApp extends Component {
    
    componentWillMount(props) {
        
    }

    async onSubmit(metric, f) {
        let { tableMetadata } = this.props;
        if (metric.id != null) {
            await this.props.updateMetric(metric);
            MetabaseAnalytics.trackEvent("Data Model", "Metric Updated");
        } else {
            await this.props.createMetric(metric);
            MetabaseAnalytics.trackEvent("Data Model", "Metric Created");
        }

        this.onLocationChange("/admin/datamodel/database/" + tableMetadata.db_id + "/table/" + tableMetadata.id);
    }

    // HACK: figure out a better way to do this that works with both redux-router and Angular's router
    onLocationChange(path) {
        const el = angular.element(document.querySelector("body"));
        el.scope().$apply(function() {
            el.injector().get("$location").path(path);
        });
    }

    render() {
        return (
            <VirtualTableEditor
                {...this.props}
                onSubmit={this.onSubmit.bind(this)}
            />
        );
    }
}
