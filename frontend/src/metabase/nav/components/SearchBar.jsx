/* eslint-disable react/prop-types */
import React, { useEffect, useCallback, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { t } from "ttag";

import OnClickOutsideWrapper from "metabase/components/OnClickOutsideWrapper";

import { usePrevious } from "metabase/hooks/use-previous";
import { useToggle } from "metabase/hooks/use-toggle";
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

function isSearchPageLocation(location) {
  const components = location.pathname.split("/");
  return components[components.length - 1];
}

function SearchBar({ location, onChangeLocation }) {
  const [searchText, setSearchText] = useState(() =>
    isSearchPageLocation(location) ? location.query.q : "",
  );

  const [isActive, { turnOn: setActive, turnOff: setInactive }] = useToggle(
    false,
  );

  const previousLocation = usePrevious(location);
  const searchInput = useRef(null);

  const onTextChange = useCallback(e => {
    setSearchText(e.target.value);
  }, []);

  useEffect(() => {
    const FORWARD_SLASH_KEY = 191;

    function focusOnForwardSlashPress(e) {
      if (
        e.keyCode === FORWARD_SLASH_KEY &&
        ALLOWED_SEARCH_FOCUS_ELEMENTS.has(document.activeElement.tagName)
      ) {
        ReactDOM.findDOMNode(searchInput.current).focus();
        setActive();
      }
    }

    window.addEventListener("keyup", focusOnForwardSlashPress);
    return () => window.removeEventListener("keyup", focusOnForwardSlashPress);
  }, [setActive]);

  useEffect(() => {
    if (previousLocation?.pathname !== location.pathname) {
      setSearchText(isSearchPageLocation(location) ? location.query.q : "");
    }
  }, [previousLocation, location]);

  useEffect(() => {
    if (previousLocation !== location) {
      // deactivate search when page changes
      setInactive();
    }
  }, [previousLocation, location, setInactive]);

  const handleInputKeyPress = useCallback(
    e => {
      const hasSearchQuery =
        typeof searchText === "string" && searchText.trim().length > 0;

      if (e.key === "Enter" && hasSearchQuery) {
        onChangeLocation({
          pathname: "search",
          query: { q: searchText.trim() },
        });
      }
    },
    [searchText, onChangeLocation],
  );

  return (
    <OnClickOutsideWrapper handleDismissal={setInactive}>
      <SearchWrapper onClick={setActive} active={isActive}>
        <SearchIcon />
        <SearchInput
          value={searchText}
          placeholder={t`Search` + "…"}
          maxLength={200}
          onClick={setActive}
          onChange={onTextChange}
          onKeyPress={handleInputKeyPress}
          ref={searchInput}
        />
        {isActive && MetabaseSettings.searchTypeaheadEnabled() && (
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
export default SearchBar;
