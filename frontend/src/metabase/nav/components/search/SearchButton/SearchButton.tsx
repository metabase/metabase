import { VisualState, useKBar } from "kbar";
import { useCallback } from "react";
import { t } from "ttag";

import { useIsSmallScreen } from "metabase/common/hooks/use-is-small-screen";
import { METAKEY } from "metabase/lib/browser";
import S from "metabase/nav/components/search/SearchButton/SearchButton.module.css";
import { Button, type ButtonProps, Flex, Icon } from "metabase/ui";

export const SearchButton = (props: ButtonProps) => {
  const kbar = useKBar();
  const { setVisualState } = kbar.query;

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
      c="text-tertiary"
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
      <span>{t`Search...`}</span>
      <Flex gap="xs">
        <span className={S.shortcutText}>{METAKEY}</span>
        <span className={S.shortcutText}>{t`K`}</span>
      </Flex>
    </Button>
  );
};
