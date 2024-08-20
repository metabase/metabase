import { useCallback } from "react";
import { t } from "ttag";

import { getClickBehaviorDescription } from "metabase/lib/click-behavior";
import type { DashboardCard, QuestionDashboardCard } from "metabase-types/api";

import {
  Button,
  ClickBehaviorDescription,
  ClickIcon,
  HelperText,
  Root,
} from "./ClickBehaviorSidebarOverlay.styled";

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
    <Root>
      <Button isActive={isShowingThisClickBehaviorSidebar} onClick={onClick}>
        <ClickIcon name="click" isActive={isShowingThisClickBehaviorSidebar} />
        {dashcardWidth > MIN_WIDTH_FOR_ON_CLICK_LABEL && (
          <HelperText>{t`On click`}</HelperText>
        )}
        <ClickBehaviorDescription isActive={isShowingThisClickBehaviorSidebar}>
          {getClickBehaviorDescription(dashcard)}
        </ClickBehaviorDescription>
      </Button>
    </Root>
  );
}
