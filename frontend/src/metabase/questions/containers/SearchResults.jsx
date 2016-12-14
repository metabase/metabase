import React, { Component } from "react";
import { connect } from "react-redux";

import HeaderWithBack from "metabase/components/HeaderWithBack";

import ExpandingSearchField from "../components/ExpandingSearchField";
import EntityList from "./EntityList";

import { search, selectSection } from "../questions";

import _ from "underscore";

const mapStateToProps = (state, props) => ({
})

const mapDispatchToProps = ({
    search,
    selectSection,
})

@connect(mapStateToProps, mapDispatchToProps)
class SearchResults extends Component {
    componentWillMount () {
        this.props.selectSection(this.props.location.query);
    }
    componentWillReceiveProps(nextProps) {
        if (!_.isEqual(this.props.location.query, nextProps.location.query)) {
            this.props.selectSection(nextProps.location.query);
        }
    }
    render () {
        return (
            <div className="px4 pt3">
                <div className="flex align-center">
                    <HeaderWithBack name="Search results" />
                    <div className="ml-auto flex align-center">
                        <ExpandingSearchField
                            active
                            defaultValue={this.props.location.query.q}
                            onSearch={this.props.search}
                        />
                    </div>
                </div>
                <EntityList />
            </div>
        );
    }
}

export default SearchResults;
