import React, { Component } from "react";
import { connect } from "react-redux";
import { t } from "c-3po";
import HeaderWithBack from "metabase/components/HeaderWithBack";

import ExpandingSearchField from "../components/ExpandingSearchField";
import EntityList from "./EntityList";

import { inflect } from "metabase/lib/formatting";

import { getTotalCount } from "../selectors";
import { search } from "../questions";

const mapStateToProps = (state, props) => ({
  totalCount: getTotalCount(state, props),
});

const mapDispatchToProps = {
  // pass "true" as 2nd arg to replace history state so back button still takes you back to index
  search: term => search(term, true),
};

@connect(mapStateToProps, mapDispatchToProps)
class SearchResults extends Component {
  render() {
    const { totalCount } = this.props;
    return (
      <div className="pt4">
        <div className="flex align-center border-bottom">
          <div className="pl4 pb4">
            <ExpandingSearchField
              active
              defaultValue={this.props.location.query.q}
              onSearch={this.props.search}
            />
          </div>
        </div>
        <div className="px4 pt3">
          <div className="flex align-center mb3">
            <HeaderWithBack
              name={
                totalCount != null
                  ? `${totalCount} ${inflect("result", totalCount)}`
                  : t`Search results`
              }
            />
          </div>
          <EntityList
            entityType="cards"
            entityQuery={this.props.location.query}
            showSearchWidget={false}
            defaultEmptyState={t`No matching questions found`}
          />
        </div>
      </div>
    );
  }
}

export default SearchResults;
