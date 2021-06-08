/* eslint-disable react/prop-types */
import React from "react";
import ReactDOM from "react-dom";
import { Flex } from "grid-styled";
import styled from "styled-components";
import { space } from "styled-system";
import { t } from "ttag";

import { color, lighten } from "metabase/lib/colors";

import Card from "metabase/components/Card";
import Icon from "metabase/components/Icon";
import OnClickOutsideWrapper from "metabase/components/OnClickOutsideWrapper";
import SearchResult from "metabase/search/components/SearchResult";

import { DefaultSearchColor } from "metabase/nav/constants";
import MetabaseSettings from "metabase/lib/settings";

const ActiveSearchColor = lighten(color("nav"), 0.1);

import Search from "metabase/entities/search";

const SearchWrapper = Flex.extend`
  position: relative;
  background-color: ${props =>
    props.active ? ActiveSearchColor : DefaultSearchColor};
  border-radius: 6px;
  flex: 1 1 auto;
  max-width: 50em;
  align-items: center;
  color: white;
  transition: background 300ms ease-in;
  &:hover {
    background-color: ${ActiveSearchColor};
  }
`;

const SearchInput = styled.input`
  ${space};
  background-color: transparent;
  width: 100%;
  border: none;
  color: white;
  font-size: 1em;
  font-weight: 700;
  &:focus {
    outline: none;
  }
  &::placeholder {
    color: ${color("text-white")};
  }
`;

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

  renderResults(results) {
    if (results.length === 0) {
      return (
        <li className="flex flex-column align-center justify-center p4 text-medium text-centered">
          <div className="my3">
            <Icon name="search" mb={1} size={24} />
            <h3 className="text-light">{t`Didn't find anything`}</h3>
          </div>
        </li>
      );
    } else {
      return results.map(l => (
        <li key={`${l.model}:${l.id}`}>
          <SearchResult result={l} compact={true} />
        </li>
      ));
    }
  }

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
                <Card
                  className="overflow-y-auto"
                  style={{ maxHeight: 400 }}
                  py={1}
                >
                  <Search.ListLoader
                    query={{ q: searchText.trim() }}
                    wrapped
                    reload
                    debounced
                  >
                    {({ list }) => {
                      return <ol>{this.renderResults(list)}</ol>;
                    }}
                  </Search.ListLoader>
                </Card>
              ) : null}
            </div>
          )}
        </SearchWrapper>
      </OnClickOutsideWrapper>
    );
  }
}
