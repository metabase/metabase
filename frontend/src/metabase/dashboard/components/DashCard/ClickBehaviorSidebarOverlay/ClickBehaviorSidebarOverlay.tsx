import cx from "classnames";
import { useCallback } from "react";
import { t } from "ttag";

import { getClickBehaviorDescription } from "metabase/lib/click-behavior";
import { Box, Flex, Icon } from "metabase/ui";
import type { DashboardCard, QuestionDashboardCard } from "metabase-types/api";

import S from "./ClickBehaviorSidebarOverlay.module.css";

interface Props {
  dashcard: DashboardCard;
  dashcardWidth: number;
  showClickBehaviorSidebar: (
    dashCardId: QuestionDashboardCard["id"] | null,
  ) => void;
  isShowingThisClickBehaviorSidebar: boolean;
}

const MIN_WIDTH_FOR_ON_CLICK_LABEL = 330;

export function ClickBehaviorSidebarOverlay({
  dashcard,
  dashcardWidth,
  showClickBehaviorSidebar,
  isShowingThisClickBehaviorSidebar,
}: Props) {
  const onClick = useCallback(() => {
    showClickBehaviorSidebar(
      isShowingThisClickBehaviorSidebar ? null : dashcard.id,
    );
  }, [
    dashcard.id,
    showClickBehaviorSidebar,
    isShowingThisClickBehaviorSidebar,
  ]);

  return (
    <Flex align="center" justify="center" h="100%">
      <Flex
        component="button"
        mb="md"
        fw="bold"
        px="md"
        py="sm"
        className={cx(S.Button, {
          [S.isActive]: isShowingThisClickBehaviorSidebar,
        })}
        onClick={onClick}
      >
        <Icon
          mr="sm"
          name="click"
          className={cx(S.ClickIcon, {
            [S.isActive]: isShowingThisClickBehaviorSidebar,
          })}
        />
        {dashcardWidth > MIN_WIDTH_FOR_ON_CLICK_LABEL && (
          <Box component="span" display="block" mr="md">{t`On click`}</Box>
        )}
        <Box
          component="span"
          display="block"
          className={cx(S.ClickBehaviorDescription, {
            [S.isActive]: isShowingThisClickBehaviorSidebar,
          })}
        >
          {getClickBehaviorDescription(dashcard)}
        </Box>
      </Flex>
    </Flex>
  );
}
