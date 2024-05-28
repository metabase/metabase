import { getIn } from "icepick";
import { useMemo } from "react";

import { getDashcardData } from "metabase/dashboard/selectors";
import { isTableDisplay } from "metabase/lib/click-behavior";
import { useSelector } from "metabase/lib/redux";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type {
  Dashboard,
  QuestionDashboardCard,
  ClickBehavior,
  DatasetColumn,
} from "metabase-types/api";

import { SidebarContent } from "./ClickBehaviorSidebar.styled";
import { ClickBehaviorSidebarMainView } from "./ClickBehaviorSidebarMainView/ClickBehaviorSidebarMainView";
import { TableClickBehaviorView } from "./TableClickBehaviorView/TableClickBehaviorView";
import { TypeSelector } from "./TypeSelector/TypeSelector";
import { getClickBehaviorForColumn } from "./utils";

interface Props {
  dashboard: Dashboard;
  dashcard: QuestionDashboardCard;
  parameters: UiParameter[];
  clickBehavior?: ClickBehavior;
  isTypeSelectorVisible: boolean | null;
  hasSelectedColumn: boolean;
  onColumnSelected: (column: DatasetColumn) => void;
  onSettingsChange: (clickBehavior?: Partial<ClickBehavior>) => void;
  onTypeSelectorVisibilityChange: (isVisible: boolean) => void;
}

export function ClickBehaviorSidebarContent({
  dashboard,
  dashcard,
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
    // drill-through menu
    return { type: "actionMenu" };
  }, [clickBehavior]);
  const dashcardData = useSelector(state =>
    getDashcardData(state, dashcard.id),
  );

  if (isTableDisplay(dashcard) && !hasSelectedColumn && dashcard.card_id) {
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

  if (isTypeSelectorVisible || finalClickBehavior.type === "actionMenu") {
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
