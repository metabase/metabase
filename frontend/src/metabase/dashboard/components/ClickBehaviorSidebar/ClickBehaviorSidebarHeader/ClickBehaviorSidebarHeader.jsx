/* eslint-disable react/prop-types */
import React from "react";
import { jt } from "ttag";

import Icon from "metabase/components/Icon";

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
  return (
    <SidebarHeader>
      {hasSelectedColumn ? (
        <ColumnClickBehaviorHeader onClick={onUnsetColumn}>
          <ChevronIconContainer>
            <Icon name="chevronleft" size={12} />
          </ChevronIconContainer>
          <DefaultHeader>{selectedColumn.display_name}</DefaultHeader>
        </ColumnClickBehaviorHeader>
      ) : (
        <DefaultHeader>{dashcard.card.name}</DefaultHeader>
      )}
    </SidebarHeader>
  );
}

export default ClickBehaviorSidebarHeader;
