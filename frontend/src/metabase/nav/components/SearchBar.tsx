import React, {
  FocusEvent,
  useEffect,
  useCallback,
  useRef,
  useState,
} from "react";
import { t } from "ttag";
import { Location, LocationDescriptorObject } from "history";

import Icon from "metabase/components/Icon";
import OnClickOutsideWrapper from "metabase/components/OnClickOutsideWrapper";

import { usePrevious } from "metabase/hooks/use-previous";
import { useToggle } from "metabase/hooks/use-toggle";
import { isSmallScreen } from "metabase/lib/dom";
import MetabaseSettings from "metabase/lib/settings";

import { SearchResults } from "./SearchResults";
import RecentsList from "./RecentsList";
import {
  SearchInputContainer,
  SearchIcon,
  ClearIconButton,
  SearchInput,
  SearchResultsFloatingContainer,
  SearchResultsContainer,
} from "./SearchBar.styled";

const ALLOWED_SEARCH_FOCUS_ELEMENTS = new Set(["BODY", "A"]);

type SearchAwareLocation = Location<{ q?: string }>;

type Props = {
  location: SearchAwareLocation;
  onFocus?: (e: FocusEvent<HTMLInputElement>) => void;
  onChangeLocation: (nextLocation: LocationDescriptorObject) => void;
};

function isSearchPageLocation(location: Location) {
  const components = location.pathname.split("/");
  return components[components.length - 1];
}

function getSearchTextFromLocation(location: SearchAwareLocation) {
  if (isSearchPageLocation(location)) {
    return location.query.q || "";
  }
  return "";
}

function SearchBar({ location, onFocus, onChangeLocation }: Props) {
  const [searchText, setSearchText] = useState<string>(() =>
    getSearchTextFromLocation(location),
  );

  const [isActive, { turnOn: setActive, turnOff: setInactive }] = useToggle(
    false,
  );

  const previousLocation = usePrevious(location);
  const searchInput = useRef<HTMLInputElement>(null);

  const onTextChange = useCallback(e => {
    setSearchText(e.target.value);
  }, []);

  const onClear = useCallback(e => {
    setSearchText("");
  }, []);

  useEffect(() => {
    function focusOnForwardSlashPress(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        document.activeElement?.tagName &&
        ALLOWED_SEARCH_FOCUS_ELEMENTS.has(document.activeElement.tagName)
      ) {
        searchInput.current?.focus();
        setActive();
      }
    }

    window.addEventListener("keyup", focusOnForwardSlashPress);
    return () => window.removeEventListener("keyup", focusOnForwardSlashPress);
  }, [setActive]);

  useEffect(() => {
    if (previousLocation?.pathname !== location.pathname) {
      setSearchText(getSearchTextFromLocation(location));
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

  const hasSearchText = searchText.trim().length > 0;

  return (
    <OnClickOutsideWrapper handleDismissal={setInactive}>
      <>
        <SearchInputContainer onClick={setActive}>
          <SearchIcon name="search" />
          <SearchInput
            value={searchText}
            placeholder={t`Search` + "…"}
            maxLength={200}
            onClick={setActive}
            onFocus={onFocus}
            onChange={onTextChange}
            onKeyPress={handleInputKeyPress}
            ref={searchInput}
          />
          {isSmallScreen() && hasSearchText && (
            <ClearIconButton onClick={onClear}>
              <Icon name="close" />
            </ClearIconButton>
          )}
        </SearchInputContainer>
        {isActive && MetabaseSettings.searchTypeaheadEnabled() && (
          <SearchResultsFloatingContainer>
            {hasSearchText ? (
              <SearchResultsContainer>
                <SearchResults searchText={searchText.trim()} />
              </SearchResultsContainer>
            ) : (
              <RecentsList />
            )}
          </SearchResultsFloatingContainer>
        )}
      </>
    </OnClickOutsideWrapper>
  );
}
export default SearchBar;
