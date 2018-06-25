import React from "react";

import { caseInsensitiveSearch } from "metabase/lib/string";
import _ from "underscore";

// Higher order component for filtering a list
//
// Injects searchText and onSetSearchText props, and filters down a list prop
// ("list" by default)
//
// Composes with EntityListLoader, ListSelect, etc
const listSearch = ({
  listProp = "list",
  properties = ["name"],
} = {}) => ComposedComponent =>
  class ListSearch extends React.Component {
    state = {
      searchText: "",
    };
    render() {
      const { ...props } = this.props;
      const { searchText } = this.state;
      props[listProp] =
        props[listProp] &&
        props[listProp].filter(item =>
          _.any(properties, p => caseInsensitiveSearch(item[p], searchText)),
        );

      return (
        <ComposedComponent
          {...props}
          searchText={searchText}
          onSetSearchText={searchText => this.setState({ searchText })}
        />
      );
    }
  };

export default listSearch;
