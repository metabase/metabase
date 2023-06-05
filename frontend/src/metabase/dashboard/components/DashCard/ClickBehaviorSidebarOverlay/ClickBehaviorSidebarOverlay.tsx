import { useCallback } from "react";
import { t } from "ttag";

import { getClickBehaviorDescription } from "metabase/lib/click-behavior";

import { DashboardOrderedCard } from "metabase-types/api";

import {
  Root,
  Button,
  ClickIcon,
  HelperText,
  ClickBehaviorDescription,
} from "./ClickBehaviorSidebarOverlay.styled";

interface Props {
  dashcard: DashboardOrderedCard;
  dashcardWidth: number;
  showClickBehaviorSidebar: (
    dashCardId: DashboardOrderedCard["id"] | null,
  ) => void;
  isShowingThisClickBehaviorSidebar: boolean;
}

const MIN_WIDTH_FOR_ON_CLICK_LABEL = 330;

function ClickBehaviorSidebarOverlay({
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ClickBehaviorSidebarOverlay;
