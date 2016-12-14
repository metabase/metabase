import React, { Component } from "react";
import { connect } from "react-redux";

import HeaderWithBack from "metabase/components/HeaderWithBack";

import ExpandingSearchField from "../components/ExpandingSearchField";
import EntityList from "./EntityList";

import { search } from "../questions";

const mapDispatchToProps = ({
    search
})

@connect(null, mapDispatchToProps)
class SearchResults extends Component {
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
                <EntityList query={this.props.location.query} />
            </div>
        );
    }
}

export default SearchResults;
