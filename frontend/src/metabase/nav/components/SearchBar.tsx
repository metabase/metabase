import { MouseEvent, useEffect, useCallback, useRef, useState } from "react";
import { t } from "ttag";
import { push } from "react-router-redux";
import { withRouter } from "react-router";
import { Location, LocationDescriptorObject } from "history";

import { usePrevious } from "react-use";
import { Icon } from "metabase/core/components/Icon";

import { useKeyboardShortcut } from "metabase/hooks/use-keyboard-shortcut";
import { useOnClickOutside } from "metabase/hooks/use-on-click-outside";
import { useToggle } from "metabase/hooks/use-toggle";
import { isSmallScreen } from "metabase/lib/dom";
import MetabaseSettings from "metabase/lib/settings";
import { useDispatch } from "metabase/lib/redux";
import { zoomInRow } from "metabase/query_builder/actions";

import SearchResults from "./SearchResults";
import RecentsList from "./RecentsList";
import {
  SearchInputContainer,
  SearchIcon,
  CloseSearchButton,
  SearchInput,
  SearchResultsFloatingContainer,
  SearchResultsContainer,
  SearchBarRoot,
} from "./SearchBar.styled";

const ALLOWED_SEARCH_FOCUS_ELEMENTS = new Set(["BODY", "A"]);

type SearchAwareLocation = Location<{ q?: string }>;

type RouterProps = {
  location: SearchAwareLocation;
};

type OwnProps = {
  onSearchActive?: () => void;
  onSearchInactive?: () => void;
};

type Props = RouterProps & OwnProps;

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

function SearchBarView({ location, onSearchActive, onSearchInactive }: Props) {
  const [searchText, setSearchText] = useState<string>(() =>
    getSearchTextFromLocation(location),
  );

  const [isActive, { turnOn: setActive, turnOff: setInactive }] =
    useToggle(false);

  const wasActive = usePrevious(isActive);
  const previousLocation = usePrevious(location);
  const container = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const dispatch = useDispatch();

  const onChangeLocation = useCallback(
    (nextLocation: LocationDescriptorObject) => dispatch(push(nextLocation)),
    [dispatch],
  );

  const onInputContainerClick = useCallback(() => {
    searchInput.current?.focus();
    setActive();
  }, [setActive]);

  const onTextChange = useCallback(e => {
    setSearchText(e.target.value);
  }, []);

  const onSearchItemSelect = useCallback(
    result => {
      // if we're already looking at the right model, don't navigate, just update the zoomed in row
      const isSameModel = result?.model_id === location?.state?.cardId;
      if (isSameModel && result.model === "indexed-entity") {
        zoomInRow({ objectId: result.id })(dispatch);
      } else {
        onChangeLocation(result.getUrl());
      }
    },
    [dispatch, onChangeLocation, location?.state?.cardId],
  );

  useOnClickOutside(container, setInactive);

  useKeyboardShortcut("Escape", setInactive);

  useEffect(() => {
    if (!wasActive && isActive) {
      onSearchActive?.();
    } else if (wasActive && !isActive) {
      if (isSmallScreen()) {
        setSearchText("");
      }
      onSearchInactive?.();
    }
  }, [wasActive, isActive, onSearchActive, onSearchInactive]);

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

  const handleClickOnClose = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      setInactive();
    },
    [setInactive],
  );

  return (
    <SearchBarRoot ref={container}>
      <SearchInputContainer isActive={isActive} onClick={onInputContainerClick}>
        <SearchIcon name="search" isActive={isActive} />
        <SearchInput
          isActive={isActive}
          value={searchText}
          placeholder={t`Search` + "…"}
          maxLength={200}
          onChange={onTextChange}
          onKeyPress={handleInputKeyPress}
          ref={searchInput}
        />
        {isSmallScreen() && isActive && (
          <CloseSearchButton onClick={handleClickOnClose}>
            <Icon name="close" />
          </CloseSearchButton>
        )}
      </SearchInputContainer>
      {isActive && MetabaseSettings.searchTypeaheadEnabled() && (
        <SearchResultsFloatingContainer>
          {hasSearchText ? (
            <SearchResultsContainer>
              <SearchResults
                searchText={searchText.trim()}
                onEntitySelect={onSearchItemSelect}
              />
            </SearchResultsContainer>
          ) : (
            <RecentsList />
          )}
        </SearchResultsFloatingContainer>
      )}
    </SearchBarRoot>
  );
}

export const SearchBar = withRouter(SearchBarView);

// for some reason our unit test don't work if this is a name export ¯\_(ツ)_/¯
// eslint-disable-next-line import/no-default-export
export default SearchBar;
