import cxs from "cxs";
import React, { Component } from "react";
import { connect } from "react-redux";

import Card from "../components/Card";

import { setTip, selectAndAdvance, setDatabase } from "../actions";

import { getDatabases } from "metabase/selectors/metadata";

import ResponsiveList from "metabase/components/ResponsiveList";

const mapStateToProps = state => ({
    databases: getDatabases(state),
    title: state.newQuestion.currentStep.title,
    tip: state.newQuestion.currentStep.tip
});

const mapDispatchToProps = {
    setTip,
    selectAndAdvance,
    setDatabase
};

@connect(mapStateToProps, mapDispatchToProps)
class MetricBuilder extends Component {
    constructor(props) {
        super(props);
        // keep a reference to the tip so that we don't lose it when showing
        // context specific tips
        this.tip = props.tip;
    }
    render() {
        const {
            databases,
            setTip,
            selectAndAdvance,
            setDatabase,
            title
        } = this.props;
        return (
            <ResponsiveList
                items={databases}
                onClick={database =>
                    selectAndAdvance(() => setDatabase(database.id))}
            />
        );
    }
}

export default MetricBuilder;
