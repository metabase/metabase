import { VisualState, useKBar } from "kbar";
import { useCallback } from "react";
import { t } from "ttag";

import useIsSmallScreen from "metabase/hooks/use-is-small-screen";
import { METAKEY } from "metabase/lib/browser";
import { Button, Flex, Icon, Text, Tooltip, UnstyledButton } from "metabase/ui";
/* eslint-disable no-restricted-imports */
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

import S from "./SearchButton.module.css";

// TODO: make the changes to this file EE only
export const SearchButton = () => {
  const kbar = useKBar();
  const metabot = useMetabotAgent();

  const { setVisualState } = kbar.query;

  const handleClick = useCallback(() => {
    setVisualState(VisualState.showing);
  }, [setVisualState]);

  const isSmallScreen = useIsSmallScreen();

  const label = t`Ask Metabot or search`;

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
  } else {
    return (
      <Flex
        h="36px"
        w="240px"
        justify="flex-start"
        align="center"
        style={{
          borderRadius: "var(--mantine-radius-default)",
          border: "1px solid var(--mb-color-border)",
        }}
      >
        <UnstyledButton
          className={S.iconButton}
          aria-label={t`Metabot`}
          onClick={() => metabot.setVisible(!metabot.visible)}
        >
          <Tooltip
            offset={{ mainAxis: 20 }}
            label={`${t`Open Metabot`} (${METAKEY}+b)`}
          >
            <Icon name="metabot" h="1rem" />
          </Tooltip>
        </UnstyledButton>
        <UnstyledButton
          className={S.searchTextButton}
          aria-label={label}
          onClick={handleClick}
        >
          <Text>{label}</Text>
          <Text className={S.shortcutText}>{`${METAKEY}+k`}</Text>
        </UnstyledButton>
      </Flex>
    );
  }
};
