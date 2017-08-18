import React, { Component } from "react";
import { connect } from "react-redux";
import { Link } from "react-router";

import { serializeCardForUrl } from "metabase/lib/card";

import { fetchSegments } from "metabase/redux/metadata";
import { getSegments } from "metabase/selectors/metadata";

const mapStateToProps = state => ({
    segments: Object.values(getSegments(state))
});

const mapDispatchToProps = {
    fetchSegments
};

@connect(mapStateToProps, mapDispatchToProps)
class Segments extends Component {
    componentWillMount() {
        this.props.fetchSegments();
    }
    render() {
        const { segments } = this.props;
        return (
            <div>
                <div>
                    <Link to="question/new">
                        Back
                    </Link>
                    <h2>Which segment?</h2>
                </div>
                <ol>
                    {segments.map(segment => (
                        <li key={segment.id}>
                            <Link to={serializeCardForUrl(segment.definition)}>
                                {segment.name}
                            </Link>
                        </li>
                    ))}
                </ol>
            </div>
        );
    }
}

export default Segments;
