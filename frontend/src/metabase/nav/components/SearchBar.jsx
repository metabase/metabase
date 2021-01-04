import React from "react";
import ReactDOM from "react-dom";
import { Flex } from "grid-styled";
import styled from "styled-components";
import { space } from "styled-system";
import { t } from "ttag";

import { color, lighten } from "metabase/lib/colors";

import Icon from "metabase/components/Icon";
import OnClickOutsideWrapper from "metabase/components/OnClickOutsideWrapper";

import { DefaultSearchColor } from "metabase/nav/constants";

const ActiveSearchColor = lighten(color("nav"), 0.1);

const SearchWrapper = Flex.extend`
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
  ${space} background-color: transparent;
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

  componentWillMount() {
    this._updateSearchTextFromUrl(this.props);
    window.addEventListener("keyup", this.handleKeyUp);
  }
  componentWillUnmount() {
    window.removeEventListener("keyup", this.handleKeyUp);
  }
  componentWillReceiveProps(nextProps) {
    if (this.props.location.pathname !== nextProps.location.pathname) {
      this._updateSearchTextFromUrl(nextProps);
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
            placeholder={t`Search` + "…"}
            onClick={() => this.setState({ active: true })}
            onChange={e => this.setState({ searchText: e.target.value })}
            onKeyPress={e => {
              if (e.key === "Enter" && (searchText || "").trim().length > 0) {
                this.props.onChangeLocation({
                  pathname: "search",
                  query: { q: searchText },
                });
              }
            }}
          />
        </SearchWrapper>
      </OnClickOutsideWrapper>
    );
  }
}
