import cx from "classnames";
import { useKBar } from "kbar";
import type {
  ChangeEvent,
  MouseEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";

import { useKeyboardShortcut } from "metabase/common/hooks/use-keyboard-shortcut";
import { useOnClickOutside } from "metabase/common/hooks/use-on-click-outside";
import { useToggle } from "metabase/common/hooks/use-toggle";
import {
  getFiltersFromLocation,
  getSearchTextFromLocation,
  isSearchPageLocation,
} from "metabase/common/search";
import { RecentsList } from "metabase/nav/components/search/RecentsList";
import { SearchResultsDropdown } from "metabase/nav/components/search/SearchResultsDropdown";
import { APP_BAR_HEIGHT } from "metabase/nav/constants";
import { useDispatch, useSelector } from "metabase/redux";
import type { LocationDescriptorObject } from "metabase/router";
import { push, useRouter } from "metabase/router";
import { getSetting } from "metabase/selectors/settings";
import { Box, Flex, Icon, UnstyledButton, rem } from "metabase/ui";
import { modelToUrl } from "metabase/urls";
import { isSmallScreen } from "metabase/utils/dom";
import { isWithinIframe } from "metabase/utils/iframe";
import type { SearchResult } from "metabase-types/api";

import { CommandPaletteTrigger } from "./CommandPaletteTrigger";
import S from "./SearchBar.module.css";

const ALLOWED_SEARCH_FOCUS_ELEMENTS = new Set(["BODY", "A"]);

type Props = {
  onSearchActive?: () => void;
  onSearchInactive?: () => void;
  /**
   * Override how a search result is handled. When omitted, results navigate
   * via `modelToUrl`. The main-app caller injects a callback that zooms in on
   * indexed-entity results that match the current QB page.
   */
  onSearchItemSelect?: (result: SearchResult) => void;
};

function SearchBar({
  onSearchActive,
  onSearchInactive,
  onSearchItemSelect: onSearchItemSelectProp,
}: Props) {
  const { location } = useRouter();
  const isTypeaheadEnabled = useSelector((state) =>
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
    (result: SearchResult) => {
      if (onSearchItemSelectProp) {
        onSearchItemSelectProp(result);
      } else {
        onChangeLocation(modelToUrl(result));
      }
    },
    [onSearchItemSelectProp, onChangeLocation],
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
    (e: ReactKeyboardEvent) => {
      if (e.nativeEvent.isComposing) {
        return;
      }
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
    <Box
      ref={container}
      w="100%"
      maw={{ sm: rem(232) }}
      pos={{ sm: "relative" }}
    >
      <Flex
        className={cx(S.container, { [S.active]: isActive })}
        align="center"
        pos="relative"
        flex="1 1 auto"
        onClick={onInputContainerClick}
      >
        <Icon
          name="search"
          className={cx(S.searchIcon, { [S.active]: isActive })}
        />
        <input
          className={cx(S.input, { [S.active]: isActive })}
          value={searchText}
          placeholder={t`Search` + "…"}
          maxLength={200}
          onChange={onTextChange}
          onKeyPress={handleInputKeyPress}
          ref={searchInput}
        />
        {isSmallScreen() && isActive && (
          <UnstyledButton
            className={S.closeButton}
            display="flex"
            w={rem(48)}
            h="100%"
            aria-label={t`Close search`}
            onClick={handleClickOnClose}
          >
            <Icon name="close" />
          </UnstyledButton>
        )}
        {!isSmallScreen() && !isWithinIframe() && isActive && (
          <CommandPaletteTrigger onClick={handleCommandPaletteTriggerClick} />
        )}
      </Flex>
      {isActive && isTypeaheadEnabled && (
        <Box
          pos="absolute"
          left={0}
          right={0}
          top={{ base: APP_BAR_HEIGHT, sm: rem(42) }}
          c="text-primary"
          data-testid="search-results-floating-container"
        >
          {hasSearchText ? (
            <SearchResultsDropdown
              searchText={searchText}
              onSearchItemSelect={onSearchItemSelect}
              goToSearchApp={goToSearchApp}
              context="search-bar"
            />
          ) : (
            <RecentsList />
          )}
        </Box>
      )}
    </Box>
  );
}

// for some reason our unit test don't work if this is a name export ¯\_(ツ)_/¯
// eslint-disable-next-line import/no-default-export
export default SearchBar;
