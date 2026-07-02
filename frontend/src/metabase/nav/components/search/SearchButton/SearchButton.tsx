import { VisualState, useKBar } from "kbar";
import { useCallback } from "react";
import { withRouter } from "react-router";
import { t } from "ttag";

import { useIsSmallScreen } from "metabase/common/hooks/use-is-small-screen";
import { getSearchTextFromLocation } from "metabase/common/search";
import type { SearchAwareLocation } from "metabase/common/search/types";
import { Button, type ButtonProps, Flex, Icon } from "metabase/ui";
import { METAKEY } from "metabase/utils/browser";

import S from "./SearchButton.module.css";

type SearchButtonProps = ButtonProps & {
  location: SearchAwareLocation;
};

const SearchButtonView = ({ location, ...props }: SearchButtonProps) => {
  const kbar = useKBar();
  const { setVisualState } = kbar.query;
  const searchText = getSearchTextFromLocation(location);

  const handleClick = useCallback(() => {
    setVisualState(VisualState.showing);
  }, [setVisualState]);

  const isSmallScreen = useIsSmallScreen();

  if (isSmallScreen) {
    return (
      <Button
        h="36px"
        leftSection={<Icon name="search" />}
        variant="subtle"
        onClick={handleClick}
        color="text-secondary"
        aria-label="Search"
      />
    );
  }

  return (
    <Button
      h="36px"
      w="240px"
      c={searchText ? "text-primary" : "text-disabled"}
      leftSection={<Icon name="search" c="text-primary" />}
      onClick={handleClick}
      styles={{
        inner: {
          width: "100%",
        },
        label: {
          display: "inline-flex",
          justifyContent: "space-between",
          width: "100%",
        },
      }}
      className={S.searchTextButton}
      aria-label="Search"
      {...props}
    >
      <span>{searchText || t`Search...`}</span>
      <Flex gap="xs">
        <span className={S.shortcutText}>{METAKEY}</span>
        <span className={S.shortcutText}>{t`K`}</span>
      </Flex>
    </Button>
  );
};

export const SearchButton = withRouter(SearchButtonView);
