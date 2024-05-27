import { useKBar, VisualState } from "kbar";
import { useCallback } from "react";
import { t } from "ttag";

import useIsSmallScreen from "metabase/hooks/use-is-small-screen";
import { METAKEY } from "metabase/lib/browser";
import { Button, Icon, Tooltip } from "metabase/ui";

export const SearchButton = () => {
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
        leftIcon={<Icon name="search" />}
        variant="subtle"
        onClick={handleClick}
        color="text-medium"
        aria-label="Search"
      />
    );
  } else {
    return (
      <Tooltip label={`${t`Search...`} (${METAKEY}+k)`}>
        <Button
          h="36px"
          w="240px"
          leftIcon={<Icon name="search" />}
          onClick={handleClick}
          // TODO: Adjust this with Mantine V7
          styles={{
            inner: {
              justifyContent: "start",
            },
          }}
          aria-label="Search"
        >
          {t`Search`}
        </Button>
      </Tooltip>
    );
  }
};
