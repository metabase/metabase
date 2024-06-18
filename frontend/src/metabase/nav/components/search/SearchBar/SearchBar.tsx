import type { LocationDescriptorObject } from "history";
import { useKBar } from "kbar";
import type { ChangeEvent, MouseEvent } from "react";
import { useEffect, useCallback, useRef, useState, useMemo } from "react";
import { withRouter } from "react-router";
import { push } from "react-router-redux";
import { usePrevious } from "react-use";
import { t } from "ttag";

import { useKeyboardShortcut } from "metabase/hooks/use-keyboard-shortcut";
import { useOnClickOutside } from "metabase/hooks/use-on-click-outside";
import { useToggle } from "metabase/hooks/use-toggle";
import { isSmallScreen, isWithinIframe } from "metabase/lib/dom";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { RecentsList } from "metabase/nav/components/search/RecentsList";
import { SearchResultsDropdown } from "metabase/nav/components/search/SearchResultsDropdown";
import { zoomInRow } from "metabase/query_builder/actions";
import type { SearchAwareLocation, WrappedResult } from "metabase/search/types";
import {
  getFiltersFromLocation,
  getSearchTextFromLocation,
  isSearchPageLocation,
} from "metabase/search/utils";
import { getSetting } from "metabase/selectors/settings";
import { Icon } from "metabase/ui";

import { CommandPaletteTrigger } from "./CommandPaletteTrigger";
import {
  SearchInputContainer,
  SearchIcon,
  CloseSearchButton,
  SearchInput,
  SearchResultsFloatingContainer,
  SearchBarRoot,
} from "./SearchBar.styled";

const ALLOWED_SEARCH_FOCUS_ELEMENTS = new Set(["BODY", "A"]);

type RouterProps = {
  location: SearchAwareLocation;
};

type OwnProps = {
  onSearchActive?: () => void;
  onSearchInactive?: () => void;
};

type Props = RouterProps & OwnProps;

function SearchBarView({ location, onSearchActive, onSearchInactive }: Props) {
  const isTypeaheadEnabled = useSelector(state =>
    getSetting(state, "search-typeahead-enabled"),
  );

  const [searchText, setSearchText] = useState<string>(
    getSearchTextFromLocation(location),
  );

  const searchFilters = useMemo(
    () => getFiltersFromLocation(location),
    [location],
  );

  const [isActive, { turnOn: setActive, turnOff: setInactive }] =
    useToggle(false);

  const wasActive = usePrevious(isActive);
  const previousLocation = usePrevious(location);
  const container = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const dispatch = useDispatch();

  const hasSearchText = searchText.trim().length > 0;

  const onChangeLocation = useCallback(
    (nextLocation: LocationDescriptorObject | string) =>
      dispatch(push(nextLocation)),
    [dispatch],
  );

  const onInputContainerClick = useCallback(() => {
    searchInput.current?.focus();
    setActive();
  }, [setActive]);

  const onTextChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setSearchText(e.target.value);
  }, []);

  const onSearchItemSelect = useCallback(
    (result: WrappedResult) => {
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
    if (previousLocation !== location && location.action !== "REPLACE") {
      // deactivate search when page changes
      setInactive();
    }
  }, [previousLocation, location, setInactive]);

  const goToSearchApp = useCallback(() => {
    const shouldPersistFilters = isSearchPageLocation(previousLocation);
    const filters = shouldPersistFilters ? searchFilters : {};

    const query = {
      q: searchText.trim(),
      ...filters,
    };
    onChangeLocation({
      pathname: "search",
      query,
    });
  }, [onChangeLocation, previousLocation, searchFilters, searchText]);

  const handleInputKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && hasSearchText) {
        goToSearchApp();
      }
    },
    [goToSearchApp, hasSearchText],
  );

  const handleClickOnClose = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      setInactive();
    },
    [setInactive],
  );

  const { query } = useKBar();

  const handleCommandPaletteTriggerClick = (e: React.MouseEvent) => {
    query.toggle();
    setInactive();
    e.stopPropagation();
  };

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
        {!isSmallScreen() && !isWithinIframe() && isActive && (
          <CommandPaletteTrigger onClick={handleCommandPaletteTriggerClick} />
        )}
      </SearchInputContainer>
      {isActive && isTypeaheadEnabled && (
        <SearchResultsFloatingContainer data-testid="search-results-floating-container">
          {hasSearchText ? (
            <SearchResultsDropdown
              searchText={searchText}
              onSearchItemSelect={onSearchItemSelect}
              goToSearchApp={goToSearchApp}
              isSearchBar={true}
            />
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
