import type * as React from "react";
import { jt, t } from "ttag";

import { isTableDisplay } from "metabase/lib/click-behavior";
import { Box, Icon } from "metabase/ui";
import type { DashboardCard, DatasetColumn } from "metabase-types/api";

import S from "../ClickBehaviorSidebar.module.css";
import { Heading } from "../ClickBehaviorSidebarComponents";

import ClickBehaviorSidebarHeaderS from "./ClickBehaviorSidebarHeader.module.css";

function DefaultHeader({ children }: { children: React.ReactNode }) {
  return (
    <Heading>{jt`Click behavior for ${(
      <span className={ClickBehaviorSidebarHeaderS.ItemName} key="name">
        {children}
      </span>
    )}`}</Heading>
  );
}

interface Props {
  dashcard: DashboardCard;
  selectedColumn?: DatasetColumn | null;
  onUnsetColumn: () => void;
}

function HeaderContent({ dashcard, selectedColumn, onUnsetColumn }: Props) {
  if (isTableDisplay(dashcard)) {
    if (selectedColumn) {
      return (
        <Box
          className={ClickBehaviorSidebarHeaderS.ColumnClickBehaviorHeader}
          onClick={onUnsetColumn}
        >
          <Box className={ClickBehaviorSidebarHeaderS.ChevronIconContainer}>
            <Icon name="chevronleft" size={12} />
          </Box>
          <DefaultHeader>{selectedColumn.display_name}</DefaultHeader>
        </Box>
      );
    }
    return <Heading>{t`On-click behavior for each column`}</Heading>;
  }
  return <DefaultHeader>{dashcard.card.name}</DefaultHeader>;
}

export const ClickBehaviorSidebarHeader = (props: Props) => {
  return (
    <Box className={S.SidebarHeader}>
      <HeaderContent {...props} />
    </Box>
  );
};
