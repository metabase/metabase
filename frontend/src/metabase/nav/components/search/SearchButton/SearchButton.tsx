import { useKBar, VisualState } from "kbar";
import { useCallback } from "react";
import { t } from "ttag";

import { METAKEY } from "metabase/lib/browser";
import { Button, Icon, Tooltip, MediaQuery } from "metabase/ui";

export const SearchButton = () => {
  const kbar = useKBar();
  const { setVisualState } = kbar.query;

  const handleClick = useCallback(() => {
    setVisualState(VisualState.showing);
  }, [setVisualState]);

  return (
    <>
      <MediaQuery smallerThan="sm" styles={{ display: "none" }}>
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
      </MediaQuery>
      <MediaQuery largerThan="sm" styles={{ display: "none" }}>
        <Button
          h="36px"
          leftIcon={<Icon name="search" />}
          variant="subtle"
          onClick={handleClick}
          color="text-medium"
          aria-label="Search"
        />
      </MediaQuery>
    </>
  );
};
