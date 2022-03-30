/* eslint-disable react/prop-types */
import React from "react";
import ReactDOM from "react-dom";
import { t } from "ttag";

import OnClickOutsideWrapper from "metabase/components/OnClickOutsideWrapper";

import MetabaseSettings from "metabase/lib/settings";

import { SearchResults } from "./SearchResults";
import RecentsList from "./RecentsList";
import {
  SearchWrapper,
  SearchIcon,
  SearchInput,
  SearchResultsFloatingContainer,
  SearchResultsContainer,
} from "./SearchBar.styled";

const ALLOWED_SEARCH_FOCUS_ELEMENTS = new Set(["BODY", "A"]);

export default class SearchBar extends React.Component {
  state = {
    active: false,
    searchText: "",
  };

  UNSAFE_componentWillMount() {
    this._updateSearchTextFromUrl(this.props);
    window.addEventListener("keyup", this.handleKeyUp);
  }

  componentWillUnmount() {
    window.removeEventListener("keyup", this.handleKeyUp);
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    if (this.props.location.pathname !== nextProps.location.pathname) {
      this._updateSearchTextFromUrl(nextProps);
    }
    // deactivate search on navigation
    if (this.props.location !== nextProps.location) {
      this.setInactive();
    }
  }

  setActive = () => {
    this.setState({ active: true });
  };

  setInactive = () => {
    this.setState({ active: false });
  };

  _updateSearchTextFromUrl(props) {
    const components = props.location.pathname.split("/");
    if (components[components.length - 1] === "search") {
      this.setState({ searchText: props.location.query.q });
    } else {
      this.setState({ searchText: "" });
    }
  }

  onChange = e => {
    this.setState({ searchText: e.target.value });
  };

  handleKeyUp = e => {
    const FORWARD_SLASH_KEY = 191;
    if (
      e.keyCode === FORWARD_SLASH_KEY &&
      ALLOWED_SEARCH_FOCUS_ELEMENTS.has(document.activeElement.tagName)
    ) {
      ReactDOM.findDOMNode(this.searchInput).focus();
      this.setActive();
    }
  };

  handleKeyPress = e => {
    const { searchText } = this.state;
    const hasSearchQuery =
      typeof searchText === "string" && searchText.trim().length > 0;

    if (e.key === "Enter" && hasSearchQuery) {
      this.props.onChangeLocation({
        pathname: "search",
        query: { q: searchText.trim() },
      });
    }
  };

  render() {
    const { active, searchText } = this.state;
    return (
      <OnClickOutsideWrapper handleDismissal={this.setInactive}>
        <SearchWrapper onClick={this.setActive} active={active}>
          <SearchIcon />
          <SearchInput
            value={searchText}
            placeholder={t`Search` + "…"}
            maxLength={200}
            onClick={this.setActive}
            onChange={this.onChange}
            onKeyPress={this.handleKeyPress}
            ref={ref => {
              this.searchInput = ref;
            }}
          />
          {active && MetabaseSettings.searchTypeaheadEnabled() && (
            <SearchResultsFloatingContainer>
              {searchText.trim().length > 0 ? (
                <SearchResultsContainer>
                  <SearchResults searchText={searchText.trim()} />
                </SearchResultsContainer>
              ) : (
                <RecentsList />
              )}
            </SearchResultsFloatingContainer>
          )}
        </SearchWrapper>
      </OnClickOutsideWrapper>
    );
  }
}
