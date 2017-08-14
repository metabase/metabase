import React, { Component } from "react";
import { Link } from "react-router";
import { connect } from "react-redux";

import { fetchSegments, fetchMetrics } from "metabase/redux/metadata";
import { getSegments, getMetrics } from "metabase/selectors/metadata";

const mapStateToProps = state => ({
    metrics: getMetrics(state),
    segments: getSegments(state)
});

const mapDispatchToProps = {
    fetchMetrics,
    fetchSegments
};

@connect(mapStateToProps, mapDispatchToProps)
class Start extends Component {
    componentWillMount() {
        this.props.fetchMetrics();
        this.props.fetchSegments();
    }
    render() {
        const { metrics, segments } = this.props;
        return (
            <div className="wrapper">
                Start
                <div className="Grid Grid--1of2 Grid--gutters">
                    {metrics &&
                        <div className= "Grid-cell">
                            <Link to="/question/new/metrics">
                                <div className="bordered rounded shadowed p4">
                                    <h2>Metrics</h2>
                                </div>
                            </Link>
                        </div>}
                    {segments &&
                        <div className="Grid-cell">
                            <Link to="/question/new/segments">
                                <div className="bordered rounded shadowed p4">
                                    <h2>Segments</h2>
                                </div>
                            </Link>
                        </div>}
                    <div className="Grid-cell">
                        <Link to="/question">
                            <div className="bordered rounded shadowed p4">
                                <h2>Start fresh</h2>
                            </div>
                        </Link>
                    </div>
                    <div className="Grid-cell">
                        <Link to="/question">
                            <div className="bordered rounded shadowed p4">
                                <h2>Start with SQL</h2>
                            </div>
                        </Link>
                    </div>
                </div>
            </div>
        );
    }
}

export default Start;
