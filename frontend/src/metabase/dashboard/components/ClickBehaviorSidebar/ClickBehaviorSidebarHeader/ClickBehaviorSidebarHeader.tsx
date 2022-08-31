import React from "react";
import { t, jt } from "ttag";

import Icon from "metabase/components/Icon";

import { isTableDisplay } from "metabase/lib/click-behavior";

import type { DashboardOrderedCard } from "metabase-types/api";
import type { Column } from "metabase-types/types/Dataset";

import { Heading, SidebarHeader } from "../ClickBehaviorSidebar.styled";
import {
  ColumnClickBehaviorHeader,
  ChevronIconContainer,
  ItemName,
} from "./ClickBehaviorSidebarHeader.styled";

function DefaultHeader({ children }: { children: string }) {
  return (
    <Heading>{jt`Click behavior for ${(
      <ItemName>{children}</ItemName>
    )}`}</Heading>
  );
}

interface Props {
  dashcard: DashboardOrderedCard;
  selectedColumn?: Column | null;
  onUnsetColumn: () => void;
}

function HeaderContent({ dashcard, selectedColumn, onUnsetColumn }: Props) {
  if (isTableDisplay(dashcard)) {
    if (selectedColumn) {
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
}

function ClickBehaviorSidebarHeader(props: Props) {
  return (
    <SidebarHeader>
      <HeaderContent {...props} />
    </SidebarHeader>
  );
}

export default ClickBehaviorSidebarHeader;
