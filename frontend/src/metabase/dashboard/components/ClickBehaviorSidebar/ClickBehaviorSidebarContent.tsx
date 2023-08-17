import { useMemo } from "react";
import { getIn } from "icepick";
import _ from "underscore";

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
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import type { UiParameter } from "metabase-lib/parameters/types";
import Question from "metabase-lib/Question";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";
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
    return { type: "actionMenu" };
  }, [clickBehavior]);

  const metadata = useSelector(getMetadata);

  if (isTableDisplay(dashcard) && !hasSelectedColumn && dashcard.card_id) {
    const columns = getIn(dashcardData, [dashcard.card_id, "data", "cols"]);

    // TODO: not sure what type to use here. I've tried both `Field` and `DatasetColumn`, but they're incompatible
    let disabledStructuredQuestionColumns: any[] = [];
    const dashcardQuery = new Question(dashcard.card, metadata).query();
    if (dashcardQuery instanceof StructuredQuery) {
      const fieldsOptions = dashcardQuery.fieldsOptions(dimension => {
        return !_.find(columns, column =>
          dimension.isSameBaseDimension(column.field_ref),
        );
      });

      disabledStructuredQuestionColumns = fieldsOptions.dimensions.map(
        dimension => dimension.column(),
      );
    }

    return (
      <TableClickBehaviorView
        columns={columns}
        disabledStructuredQuestionColumns={disabledStructuredQuestionColumns}
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ClickBehaviorSidebar;
