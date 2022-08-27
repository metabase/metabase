import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getIn } from "icepick";

import {
  isTableDisplay,
  clickBehaviorIsValid,
} from "metabase/lib/click-behavior";
import { keyForColumn } from "metabase/lib/dataset";

import { useOnMount } from "metabase/hooks/use-on-mount";
import { usePrevious } from "metabase/hooks/use-previous";

import Sidebar from "metabase/dashboard/components/Sidebar";

import type { UiParameter } from "metabase/parameters/types";
import type {
  Dashboard,
  DashboardOrderedCard,
  DashCardId,
  CardId,
  ClickBehavior,
  DatasetData,
} from "metabase-types/api";
import type { Column } from "metabase-types/types/Dataset";

import ClickBehaviorSidebarHeader from "./ClickBehaviorSidebarHeader";
import ClickBehaviorSidebarMainView from "./ClickBehaviorSidebarMainView";
import TableClickBehaviorView from "./TableClickBehaviorView";
import TypeSelector from "./TypeSelector";
import { SidebarContent } from "./ClickBehaviorSidebar.styled";

function getClickBehaviorForColumn(
  dashcard: DashboardOrderedCard,
  column: Column,
) {
  return getIn(dashcard, [
    "visualization_settings",
    "column_settings",
    keyForColumn(column),
    "click_behavior",
  ]);
}

function shouldShowTypeSelector(clickBehavior?: ClickBehavior) {
  return !clickBehavior || clickBehavior.type == null;
}

type VizSettings = Record<string, unknown>;

interface Props {
  dashboard: Dashboard;
  dashcard: DashboardOrderedCard;
  dashcardData: Record<DashCardId, Record<CardId, DatasetData>>;
  parameters: UiParameter[];
  hideClickBehaviorSidebar: () => void;
  onUpdateDashCardColumnSettings: (
    id: DashCardId,
    columnKey: string,
    settings?: VizSettings | null,
  ) => void;
  onUpdateDashCardVisualizationSettings: (
    id: DashCardId,
    settings?: VizSettings | null,
  ) => void;
  onReplaceAllDashCardVisualizationSettings: (
    id: DashCardId,
    settings?: VizSettings | null,
  ) => void;
}

function ClickBehaviorSidebar({
  dashboard,
  dashcard,
  dashcardData,
  parameters,
  hideClickBehaviorSidebar,
  onUpdateDashCardColumnSettings,
  onUpdateDashCardVisualizationSettings,
  onReplaceAllDashCardVisualizationSettings,
}: Props) {
  const [isTypeSelectorVisible, setTypeSelectorVisible] = useState<
    boolean | null
  >(null);

  const [selectedColumn, setSelectedColumn] = useState<Column | null>(null);

  const [originalVizSettings, setOriginalVizSettings] = useState<
    VizSettings | undefined | null
  >(null);

  const [originalColumnVizSettings, setOriginalColumnVizSettings] = useState<
    VizSettings | undefined | null
  >(null);

  const previousDashcard = usePrevious(dashcard);
  const hasSelectedColumn = selectedColumn != null;

  const clickBehavior: ClickBehavior | undefined = useMemo(() => {
    if (isTableDisplay(dashcard) && !hasSelectedColumn) {
      return;
    }
    if (hasSelectedColumn) {
      return getClickBehaviorForColumn(dashcard, selectedColumn);
    } else {
      return getIn(dashcard, ["visualization_settings", "click_behavior"]);
    }
  }, [dashcard, selectedColumn, hasSelectedColumn]);

  const isValidClickBehavior = useMemo(
    () => clickBehaviorIsValid(clickBehavior),
    [clickBehavior],
  );

  const handleChangeSettings = useCallback(
    nextClickBehavior => {
      const { id } = dashcard;

      if (selectedColumn == null) {
        onUpdateDashCardVisualizationSettings(id, {
          click_behavior: nextClickBehavior,
        });
      } else {
        onUpdateDashCardColumnSettings(id, keyForColumn(selectedColumn), {
          click_behavior: nextClickBehavior,
        });
      }

      const changedType = nextClickBehavior.type !== clickBehavior?.type;
      if (changedType) {
        // move to next screen
        setTypeSelectorVisible(false);
      }
    },
    [
      dashcard,
      clickBehavior,
      selectedColumn,
      onUpdateDashCardColumnSettings,
      onUpdateDashCardVisualizationSettings,
    ],
  );

  const handleColumnSelected = useCallback(
    column => {
      const originalColumnVizSettings = getClickBehaviorForColumn(
        dashcard,
        column,
      );
      setSelectedColumn(column);
      setOriginalColumnVizSettings(originalColumnVizSettings);
    },
    [dashcard],
  );

  const handleUnsetSelectedColumn = useCallback(() => {
    if (!isValidClickBehavior) {
      handleChangeSettings(originalColumnVizSettings);
    }
    setOriginalColumnVizSettings(null);
    setSelectedColumn(null);
  }, [isValidClickBehavior, originalColumnVizSettings, handleChangeSettings]);

  const handleCancel = useCallback(() => {
    onReplaceAllDashCardVisualizationSettings(dashcard.id, originalVizSettings);
    hideClickBehaviorSidebar();
  }, [
    dashcard,
    originalVizSettings,
    hideClickBehaviorSidebar,
    onReplaceAllDashCardVisualizationSettings,
  ]);

  useOnMount(() => {
    if (shouldShowTypeSelector(clickBehavior)) {
      setTypeSelectorVisible(true);
    }
    if (dashcard) {
      setOriginalVizSettings(dashcard.visualization_settings);
    }
  });

  useEffect(() => {
    if (!previousDashcard) {
      return;
    }

    if (dashcard.id !== previousDashcard.id) {
      setOriginalVizSettings(dashcard.visualization_settings);
      if (hasSelectedColumn) {
        handleUnsetSelectedColumn();
      }
    }
  }, [
    dashcard,
    previousDashcard,
    hasSelectedColumn,
    handleUnsetSelectedColumn,
  ]);

  const renderContent = useCallback(() => {
    const finalClickBehavior = clickBehavior || { type: "actionMenu" };

    if (isTableDisplay(dashcard) && !hasSelectedColumn) {
      const columns = getIn(dashcardData, [dashcard.card_id, "data", "cols"]);
      return (
        <TableClickBehaviorView
          columns={columns}
          dashcard={dashcard}
          getClickBehaviorForColumn={(column: Column) =>
            getClickBehaviorForColumn(dashcard, column)
          }
          onColumnClick={handleColumnSelected}
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
            updateSettings={handleChangeSettings}
            moveToNextPage={() => setTypeSelectorVisible(false)}
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
        handleShowTypeSelector={() => setTypeSelectorVisible(true)}
        updateSettings={handleChangeSettings}
      />
    );
  }, [
    dashboard,
    dashcard,
    dashcardData,
    clickBehavior,
    parameters,
    hasSelectedColumn,
    isTypeSelectorVisible,
    handleChangeSettings,
    handleColumnSelected,
  ]);

  return (
    <Sidebar
      onClose={hideClickBehaviorSidebar}
      onCancel={handleCancel}
      closeIsDisabled={!isValidClickBehavior}
    >
      <ClickBehaviorSidebarHeader
        dashcard={dashcard}
        selectedColumn={selectedColumn}
        onUnsetColumn={handleUnsetSelectedColumn}
      />
      <div>{renderContent()}</div>
    </Sidebar>
  );
}

export default ClickBehaviorSidebar;
