import React from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";
import { t } from "ttag";
import Icon from "metabase/components/Icon";
import OnClickOutsideWrapper from "metabase/components/OnClickOutsideWrapper";
import MetabaseSettings from "metabase/lib/settings";
import SearchResults from "metabase/nav/components/SearchResults";
import {
  SearchWrapper,
  SearchInput,
} from "metabase/nav/components/SearchBar.styled.jsx";

import RecentsList from "./RecentsList";

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
      this.setState({ active: false });
    }
  }
  _updateSearchTextFromUrl(props) {
    const components = props.location.pathname.split("/");
    if (components[components.length - 1] === "search") {
      this.setState({ searchText: props.location.query.q });
    } else {
      this.setState({ searchText: "" });
    }
  }
  handleKeyUp = (e: KeyboardEvent) => {
    const FORWARD_SLASH_KEY = 191;
    if (
      e.keyCode === FORWARD_SLASH_KEY &&
      ALLOWED_SEARCH_FOCUS_ELEMENTS.has(document.activeElement.tagName)
    ) {
      ReactDOM.findDOMNode(this.searchInput).focus();
      this.setState({ active: true });
    }
  };

  render() {
    const { active, searchText } = this.state;
    return (
      <OnClickOutsideWrapper
        handleDismissal={() => this.setState({ active: false })}
      >
        <SearchWrapper
          onClick={() => this.setState({ active: true })}
          active={active}
        >
          <Icon name="search" ml={["10px", 2]} />
          <SearchInput
            py={2}
            pr={[0, 2]}
            pl={1}
            ref={ref => (this.searchInput = ref)}
            value={searchText}
            maxLength={200}
            placeholder={t`Search` + "…"}
            onClick={() => this.setState({ active: true })}
            onChange={e => this.setState({ searchText: e.target.value })}
            onKeyPress={e => {
              if (e.key === "Enter" && (searchText || "").trim().length > 0) {
                this.props.onChangeLocation({
                  pathname: "search",
                  query: { q: searchText.trim() },
                });
              }
            }}
          />
          {active && MetabaseSettings.searchTypeaheadEnabled() && (
            <div className="absolute left right text-dark" style={{ top: 60 }}>
              {searchText.trim().length > 0 ? (
                <SearchResults searchText={searchText} />
              ) : (
                <RecentsList />
              )}
            </div>
          )}
        </SearchWrapper>
      </OnClickOutsideWrapper>
    );
  }
}
SearchBar.propTypes = {
  location: PropTypes.object,
  onChangeLocation: PropTypes.func,
};
