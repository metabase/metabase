import type * as React from "react";
import { t, jt } from "ttag";

import { isTableDisplay } from "metabase/lib/click-behavior";
import { Icon } from "metabase/ui";
import type { QuestionDashboardCard, DatasetColumn } from "metabase-types/api";

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
  dashcard: QuestionDashboardCard;
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
  return <DefaultHeader>{dashcard.card.name}</DefaultHeader>;
}

export const ClickBehaviorSidebarHeader = (props: Props) => {
  return (
    <SidebarHeader>
      <HeaderContent {...props} />
    </SidebarHeader>
  );
};
