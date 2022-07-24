import React from "react";
import cx from "classnames";
import _ from "underscore";
import { t } from "ttag";

import Icon from "metabase/components/Icon";

import { getClickBehaviorDescription } from "metabase/lib/click-behavior";

import { DashCard, DashCardId } from "metabase-types/types/Dashboard";

interface Props {
  dashcard: DashCard;
  dashcardWidth: number;
  showClickBehaviorSidebar: (dashCardId: DashCardId | null) => void;
  isShowingThisClickBehaviorSidebar: boolean;
}

const MIN_WIDTH_FOR_ON_CLICK_LABEL = 330;

function ClickBehaviorSidebarOverlay({
  dashcard,
  dashcardWidth,
  showClickBehaviorSidebar,
  isShowingThisClickBehaviorSidebar,
}: Props) {
  return (
    <div className="flex align-center justify-center full-height">
      <div
        className={cx("text-bold flex py1 px2 mb2 rounded cursor-pointer", {
          "bg-brand text-white": isShowingThisClickBehaviorSidebar,
          "bg-light text-medium": !isShowingThisClickBehaviorSidebar,
        })}
        onClick={() =>
          showClickBehaviorSidebar(
            isShowingThisClickBehaviorSidebar ? null : dashcard.id,
          )
        }
      >
        <Icon
          name="click"
          className={cx("mr1", {
            "text-light": !isShowingThisClickBehaviorSidebar,
          })}
        />
        {dashcardWidth > MIN_WIDTH_FOR_ON_CLICK_LABEL && (
          <div className="mr2">{t`On click`}</div>
        )}
        <div
          className={cx({ "text-brand": !isShowingThisClickBehaviorSidebar })}
        >
          {getClickBehaviorDescription(dashcard)}
        </div>
      </div>
    </div>
  );
}

export default ClickBehaviorSidebarOverlay;
