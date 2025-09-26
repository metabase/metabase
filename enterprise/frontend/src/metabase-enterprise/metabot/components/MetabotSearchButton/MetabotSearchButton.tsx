import { VisualState, useKBar } from "kbar";
import { useCallback } from "react";
import { c } from "ttag";

import useIsSmallScreen from "metabase/common/hooks/use-is-small-screen";
import S from "metabase/nav/components/search/SearchButton/SearchButton.module.css";
import { Button, Flex, Icon } from "metabase/ui";

export const MetabotSearchButton = () => {
  const kbar = useKBar();

  const { setVisualState } = kbar.query;

  const handleClick = useCallback(() => {
    setVisualState(VisualState.showing);
  }, [setVisualState]);

  const isSmallScreen = useIsSmallScreen();

  const label = c("'Search' here is a verb").t`Search...`;

  if (isSmallScreen) {
    return (
      <Button
        h="36px"
        leftSection={<Icon name="metabot" />}
        variant="subtle"
        onClick={handleClick}
        color="text-medium"
        aria-label={label}
      />
    );
  }

  return (
    <Flex
      h="2.25rem"
      miw="15rem"
      justify="flex-start"
      align="center"
      style={{
        borderRadius: "var(--mantine-radius-default)",
        border: "1px solid var(--mb-color-border)",
      }}
    >
      <Button
        className={S.searchTextButton}
        h="2.25rem"
        aria-label={label}
        onClick={handleClick}
        variant="subtle"
        color="text-light"
        leftSection={<Icon name="search" />}
      >
        {label}
      </Button>
    </Flex>
  );
};
