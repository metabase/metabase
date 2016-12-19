import React, { Component } from "react";
import { connect } from "react-redux";

import HeaderWithBack from "metabase/components/HeaderWithBack";

import ExpandingSearchField from "../components/ExpandingSearchField";
import EntityList from "./EntityList";

import { inflect } from "metabase/lib/formatting";

import { getTotalCount } from "../selectors";
import { search } from "../questions";

const mapStateToProps = (state, props) => ({
    totalCount: getTotalCount(state),
})

const mapDispatchToProps = ({
    search
})

@connect(mapStateToProps, mapDispatchToProps)
class SearchResults extends Component {
    render () {
        const { totalCount } = this.props;
        return (
            <div className="px4 pt3">
                <div className="flex align-center mb3">
                    <HeaderWithBack name={totalCount != null ?
                        `${totalCount} ${inflect("result", totalCount)}` :
                        "Search results"}
                    />
                    <div className="ml-auto flex align-center">
                        <ExpandingSearchField
                            active
                            defaultValue={this.props.location.query.q}
                            onSearch={this.props.search}
                        />
                    </div>
                </div>
                <EntityList query={this.props.location.query} showSearchWidget={false} />
            </div>
        );
    }
}

export default SearchResults;
