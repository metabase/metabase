import React from "react";
import ReactDOM from "react-dom";
import { Flex } from "grid-styled";
import styled from "styled-components";
import { space } from "styled-system";
import { t } from "ttag";

import { color, lighten } from "metabase/lib/colors";

import Card from "metabase/components/Card";
import Icon from "metabase/components/Icon";
import EntityItem from "metabase/components/EntityItem";
import Link from "metabase/components/Link";
import OnClickOutsideWrapper from "metabase/components/OnClickOutsideWrapper";

import { DefaultSearchColor } from "metabase/nav/constants";

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
          {active && (
            <div className="absolute left right text-dark" style={{ top: 60 }}>
              {searchText.length > 0 ? (
                <Search.ListLoader query={{ q: searchText }} wrapped reload>
                  {({ list }) => {
                    if (list.length === 0) {
                      return "No results";
                    }
                    return (
                      <Card>
                        <ol>
                          {list.map(l => (
                            <li key={`${l.model}:${l.id}`}>
                              <Link to={l.getUrl()}>
                                <EntityItem
                                  icon={l.getIcon()}
                                  name={l.name}
                                  item={l}
                                  variant="small"
                                />
                              </Link>
                            </li>
                          ))}
                        </ol>
                      </Card>
                    );
                  }}
                </Search.ListLoader>
              ) : null}
            </div>
          )}
        </SearchWrapper>
      </OnClickOutsideWrapper>
    );
  }
}
