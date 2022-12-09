import React from "react";
import { t, jt } from "ttag";

import Icon from "metabase/components/Icon";

import {
  isActionDashCard,
  getActionButtonLabel,
} from "metabase/writeback/utils";

import type { DashboardOrderedCard, DatasetColumn } from "metabase-types/api";

import { isTableDisplay } from "metabase/lib/click-behavior";
import { Heading, SidebarHeader } from "../ClickBehaviorSidebar.styled";
import {
  ColumnClickBehaviorHeader,
  ChevronIconContainer,
  ItemName,
} from "./ClickBehaviorSidebarHeader.styled";

function DefaultHeader({ children }: { children: React.ReactNode }) {
  return (
    <Heading>{jt`Click behavior for ${(
      <ItemName>{children}</ItemName>
    )}`}</Heading>
  );
}

interface Props {
  dashcard: DashboardOrderedCard;
  selectedColumn?: DatasetColumn | null;
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
  if (isActionDashCard(dashcard)) {
    const label = getActionButtonLabel(dashcard);
    return <DefaultHeader>{label || t`an action button`}</DefaultHeader>;
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
