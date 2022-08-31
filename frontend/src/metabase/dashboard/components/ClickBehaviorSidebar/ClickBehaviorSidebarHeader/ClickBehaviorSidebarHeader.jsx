/* eslint-disable react/prop-types */
import React, { useCallback } from "react";
import { t, jt } from "ttag";

import Icon from "metabase/components/Icon";

import { isTableDisplay } from "metabase/lib/click-behavior";

import { Heading, SidebarHeader } from "../ClickBehaviorSidebar.styled";
import {
  ColumnClickBehaviorHeader,
  ChevronIconContainer,
  ItemName,
} from "./ClickBehaviorSidebarHeader.styled";

function DefaultHeader({ children }) {
  return (
    <Heading>{jt`Click behavior for ${(
      <ItemName>{children}</ItemName>
    )}`}</Heading>
  );
}

function ClickBehaviorSidebarHeader({
  dashcard,
  selectedColumn,
  hasSelectedColumn,
  onUnsetColumn,
}) {
  const renderContent = useCallback(() => {
    if (isTableDisplay(dashcard)) {
      if (hasSelectedColumn) {
        return (
          <ColumnClickBehaviorHeader onClick={onUnsetColumn}>
            <ChevronIconContainer>
              <Icon name="chevronleft" size={12} />
            </ChevronIconContainer>
            <DefaultHeader>{selectedColumn.display_name}</DefaultHeader>
          </ColumnClickBehaviorHeader>
        );
      }
      return <Heading>{t`On-click behavior for each column`}</Heading>;
    }
    return <DefaultHeader>{dashcard.card.name}</DefaultHeader>;
  }, [dashcard, selectedColumn, hasSelectedColumn, onUnsetColumn]);

  return <SidebarHeader>{renderContent()}</SidebarHeader>;
}

export default ClickBehaviorSidebarHeader;
