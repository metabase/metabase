import { VisualState, useKBar } from "kbar";
import { useCallback } from "react";
import { c, t } from "ttag";

import useIsSmallScreen from "metabase/common/hooks/use-is-small-screen";
import { METAKEY } from "metabase/lib/browser";
import S from "metabase/nav/components/search/SearchButton/SearchButton.module.css";
import { Button, Flex, Icon, Text, Tooltip, UnstyledButton } from "metabase/ui";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

import { trackMetabotChatOpened } from "../../analytics";

export const MetabotSearchButton = () => {
  const kbar = useKBar();
  const metabot = useMetabotAgent();

  const { setVisualState } = kbar.query;

  const handleClick = useCallback(() => {
    setVisualState(VisualState.showing);
  }, [setVisualState]);

  const isSmallScreen = useIsSmallScreen();

  const label = c("'Search' here is a verb").t`Ask Metabot or search`;

  const tooltipMessage = metabot.visible ? t`Close Metabot` : t`Open Metabot`;

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
      <UnstyledButton
        className={S.iconButton}
        aria-label={t`Metabot`}
        onClick={() => {
          if (!metabot.visible) {
            trackMetabotChatOpened("search");
          }

          metabot.setVisible(!metabot.visible);
        }}
      >
        <Tooltip
          offset={{ mainAxis: 20 }}
          label={`${tooltipMessage} (${METAKEY}+b)`}
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
};
