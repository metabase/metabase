import React, { useMemo } from "react";
import { getIn } from "icepick";

import { isMappedExplicitActionButton } from "metabase/writeback/utils";

import type {
  Dashboard,
  DashboardOrderedCard,
  DashCardId,
  CardId,
  ClickBehavior,
  DatasetData,
  DatasetColumn,
} from "metabase-types/api";

import { isTableDisplay } from "metabase/lib/click-behavior";
import type { UiParameter } from "metabase-lib/parameters/types";
import { getClickBehaviorForColumn } from "./utils";
import ClickBehaviorSidebarMainView from "./ClickBehaviorSidebarMainView";
import TableClickBehaviorView from "./TableClickBehaviorView";
import TypeSelector from "./TypeSelector";
import { SidebarContent } from "./ClickBehaviorSidebar.styled";

interface Props {
  dashboard: Dashboard;
  dashcard: DashboardOrderedCard;
  dashcardData: Record<DashCardId, Record<CardId, DatasetData>>;
  parameters: UiParameter[];
  clickBehavior?: ClickBehavior;
  isTypeSelectorVisible: boolean | null;
  hasSelectedColumn: boolean;
  onColumnSelected: (column: DatasetColumn) => void;
  onSettingsChange: (clickBehavior?: Partial<ClickBehavior>) => void;
  onTypeSelectorVisibilityChange: (isVisible: boolean) => void;
}

function ClickBehaviorSidebar({
  dashboard,
  dashcard,
  dashcardData,
  parameters,
  clickBehavior,
  isTypeSelectorVisible,
  hasSelectedColumn,
  onColumnSelected,
  onSettingsChange,
  onTypeSelectorVisibilityChange,
}: Props) {
  const finalClickBehavior = useMemo<ClickBehavior>(() => {
    if (clickBehavior) {
      return clickBehavior;
    }
    if (isMappedExplicitActionButton(dashcard)) {
      return { type: "action" };
    }
    return { type: "actionMenu" };
  }, [clickBehavior, dashcard]);

  if (isTableDisplay(dashcard) && !hasSelectedColumn) {
    const columns = getIn(dashcardData, [dashcard.card_id, "data", "cols"]);
    return (
      <TableClickBehaviorView
        columns={columns}
        dashcard={dashcard}
        getClickBehaviorForColumn={(column: DatasetColumn) =>
          getClickBehaviorForColumn(dashcard, column)
        }
        onColumnClick={onColumnSelected}
      />
    );
  }

  if (isTypeSelectorVisible) {
    return (
      <SidebarContent>
        <TypeSelector
          clickBehavior={finalClickBehavior}
          dashcard={dashcard}
          parameters={parameters}
          updateSettings={onSettingsChange}
          moveToNextPage={() => onTypeSelectorVisibilityChange(false)}
        />
      </SidebarContent>
    );
  }

  return (
    <ClickBehaviorSidebarMainView
      clickBehavior={finalClickBehavior}
      dashboard={dashboard}
      dashcard={dashcard}
      parameters={parameters}
      handleShowTypeSelector={() => onTypeSelectorVisibilityChange(true)}
      updateSettings={onSettingsChange}
    />
  );
}

export default ClickBehaviorSidebar;
