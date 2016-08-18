import React, { Component } from "react";
import { connect } from "react-redux";

import { getDatabases } from "../selectors";
import { fetchDatabases } from "../permissions";

import Data from "../components/Data.jsx";

const mapStateToProps = function(state, props) {
    return {
        databases: getDatabases(state, props)
    };
}

const mapDispatchToProps = {
    fetchDatabases
}

@connect(mapStateToProps, mapDispatchToProps)
export default class DataApp extends Component {
    async componentWillMount() {
        await this.props.fetchDatabases();
    }

    render() {
        return (
            <Data {...this.props} />
        );
    }
}
