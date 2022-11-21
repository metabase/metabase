/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import { getClickBehaviorDescription } from "metabase/lib/click-behavior";

import {
  Root,
  Button,
  ClickIcon,
  HelperText,
  ClickBehaviorDescription,
} from "./ClickBehaviorSidebarOverlay.styled";

const MIN_WIDTH_FOR_ON_CLICK_LABEL = 330;

function ClickBehaviorSidebarOverlay({
  dashcard,
  dashcardWidth,
  showClickBehaviorSidebar,
  isShowingThisClickBehaviorSidebar,
}) {
  return (
    <Root>
      <Button
        isActive={isShowingThisClickBehaviorSidebar}
        onClick={() =>
          showClickBehaviorSidebar(
            isShowingThisClickBehaviorSidebar ? null : dashcard.id,
          )
        }
      >
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

export default ClickBehaviorSidebarOverlay;
