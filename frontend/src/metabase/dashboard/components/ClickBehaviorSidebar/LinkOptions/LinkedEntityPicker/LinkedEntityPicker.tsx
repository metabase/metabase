import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import { isPublicCollection } from "metabase/collections/utils";
import { DashboardPickerModal } from "metabase/common/components/DashboardPicker";
import { QuestionPickerModal } from "metabase/common/components/QuestionPicker";
import { useDashboardQuery } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import {
  ClickMappingsConnected,
  clickTargetObjectType,
} from "metabase/dashboard/components/ClickMappings";
import { getDashboard } from "metabase/dashboard/selectors";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import Dashboards from "metabase/entities/dashboards";
import Questions from "metabase/entities/questions";
import { useSelector } from "metabase/lib/redux";
import { Icon, Select } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type {
  Dashboard,
  DashboardId,
  QuestionDashboardCard,
  CardId,
  ClickBehavior,
  EntityCustomDestinationClickBehavior,
  DashboardTab,
} from "metabase-types/api";

import { Heading } from "../../ClickBehaviorSidebar.styled";
import { SidebarItem } from "../../SidebarItem";
import {
  LinkTargetEntityPickerContent,
  SelectedEntityPickerIcon,
  SelectedEntityPickerContent,
} from "../LinkOptions.styled";

const LINK_TARGETS = {
  question: {
    Entity: Questions,
    PickerComponent: QuestionPickerModal,
    pickerIcon: "bar" as const,
    getModalTitle: () => t`Pick a question to link to`,
    getPickerButtonLabel: () => t`Pick a question…`,
  },
  dashboard: {
    Entity: Dashboards,
    PickerComponent: DashboardPickerModal,
    pickerIcon: "dashboard" as const,
    getModalTitle: () => t`Pick a dashboard to link to`,
    getPickerButtonLabel: () => t`Pick a dashboard…`,
  },
};

const NO_DASHBOARD_TABS: DashboardTab[] = [];

function PickerControl({
  clickBehavior,
  onCancel,
  onClick,
}: {
  clickBehavior: EntityCustomDestinationClickBehavior;
  onCancel: () => void;
  onClick?: () => void;
}) {
  const { Entity, pickerIcon, getPickerButtonLabel } =
    LINK_TARGETS[clickBehavior.linkType];

  const renderLabel = useCallback(() => {
    const hasSelectedTarget = clickBehavior.targetId != null;
    if (hasSelectedTarget) {
      return <Entity.Name id={clickBehavior.targetId} />;
    }
    return getPickerButtonLabel();
  }, [Entity, clickBehavior.targetId, getPickerButtonLabel]);

  return (
    <SidebarItem.Selectable isSelected padded={false}>
      <LinkTargetEntityPickerContent onClick={onClick}>
        <SelectedEntityPickerIcon name={pickerIcon} />
        <SelectedEntityPickerContent>
          {renderLabel()}
          <Icon name="chevrondown" size={12} className={CS.mlAuto} />
        </SelectedEntityPickerContent>
      </LinkTargetEntityPickerContent>
      <SidebarItem.CloseIcon onClick={onCancel} />
    </SidebarItem.Selectable>
  );
}

function getTargetClickMappingsHeading(entity: Question | Dashboard) {
  return {
    dashboard: t`Pass values to this dashboard's filters (optional)`,
    native: t`Pass values to this question's variables (optional)`,
    gui: t`Pass values to filter this question (optional)`,
  }[clickTargetObjectType(entity)];
}

function TargetClickMappings({
  isDashboard,
  clickBehavior,
  dashcard,
  updateSettings,
}: {
  isDashboard: boolean;
  clickBehavior: EntityCustomDestinationClickBehavior;
  dashcard: QuestionDashboardCard;
  updateSettings: (settings: Partial<ClickBehavior>) => void;
}) {
  const Entity = isDashboard ? Dashboards : Questions;
  return (
    <Entity.Loader id={clickBehavior.targetId}>
      {({ object }: { object: Question | Dashboard }) => (
        <div className={CS.pt1}>
          <Heading>{getTargetClickMappingsHeading(object)}</Heading>
          <ClickMappingsConnected
            object={object}
            dashcard={dashcard}
            isDashboard={isDashboard}
            clickBehavior={clickBehavior}
            updateSettings={updateSettings}
          />
        </div>
      )}
    </Entity.Loader>
  );
}

export function LinkedEntityPicker({
  dashcard,
  clickBehavior,
  updateSettings,
}: {
  dashcard: QuestionDashboardCard;
  clickBehavior: EntityCustomDestinationClickBehavior;
  updateSettings: (settings: Partial<ClickBehavior>) => void;
}) {
  const { linkType, targetId } = clickBehavior;
  const isDashboard = linkType === "dashboard";
  const hasSelectedTarget = clickBehavior.targetId != null;
  const { getModalTitle, PickerComponent } = LINK_TARGETS[linkType];

  const [isPickerOpen, setIsPickerOpen] = useState(!hasSelectedTarget);

  const handleSelectLinkTargetEntityId = useCallback(
    (targetId: CardId | DashboardId) => {
      const isNewTargetEntity = targetId !== clickBehavior.targetId;

      if (!isNewTargetEntity) {
        return;
      }

      // For new target entity, parameter mappings for the previous link target
      // don't make sense and have to be reset.
      // The same goes for tabId when changing dashboard link target.
      if (clickBehavior.linkType === "dashboard") {
        updateSettings({
          ...clickBehavior,
          targetId,
          parameterMapping: {},
          tabId: undefined,
        });
      } else {
        updateSettings({
          ...clickBehavior,
          targetId,
          parameterMapping: {},
        } as EntityCustomDestinationClickBehavior);
      }
    },
    [clickBehavior, updateSettings],
  );

  const handleResetLinkTargetType = useCallback(() => {
    updateSettings({
      type: clickBehavior.type,
      // @ts-expect-error allow resetting
      linkType: null,
    });
  }, [clickBehavior, updateSettings]);

  const { data: targetDashboard } = useDashboardQuery({
    enabled: isDashboard,
    id: targetId,
  });
  const dashboardTabs = targetDashboard?.tabs ?? NO_DASHBOARD_TABS;
  const defaultDashboardTabId: number | undefined = dashboardTabs[0]?.id;
  const dashboardTabId = isDashboard
    ? clickBehavior.tabId ?? defaultDashboardTabId
    : undefined;
  const dashboardTabExists = dashboardTabs.some(
    tab => tab.id === dashboardTabId,
  );
  const dashboardTabIdValue =
    typeof dashboardTabId === "undefined" ? undefined : String(dashboardTabId);

  const handleDashboardTabChange = (value: string) => {
    if (!isDashboard) {
      throw new Error("This should never happen");
    }

    updateSettings({ ...clickBehavior, tabId: Number(value) });
  };

  useEffect(
    function migrateUndefinedDashboardTabId() {
      if (
        isDashboard &&
        typeof clickBehavior.tabId === "undefined" &&
        typeof defaultDashboardTabId !== "undefined"
      ) {
        updateSettings({ ...clickBehavior, tabId: defaultDashboardTabId });
      }
    },
    [clickBehavior, defaultDashboardTabId, isDashboard, updateSettings],
  );

  useEffect(
    // If the target dashboard tab has been deleted, and there are no other tabs
    // to choose from (we don't render <Select/> when there is only 1 tab)
    // automatically pick the correct target dashboard tab for the user.
    // Otherwise, make user manually pick a new dashboard tab.
    function migrateDeletedTab() {
      if (
        isDashboard &&
        !dashboardTabExists &&
        targetDashboard?.tabs &&
        targetDashboard.tabs.length < 2 &&
        typeof dashboardTabId !== "undefined"
      ) {
        updateSettings({ ...clickBehavior, tabId: defaultDashboardTabId });
      }
    },
    [
      clickBehavior,
      targetDashboard,
      dashboardTabId,
      dashboardTabExists,
      defaultDashboardTabId,
      isDashboard,
      updateSettings,
    ],
  );

  const dashboard = useSelector(getDashboard);
  const dashboardCollection = dashboard?.collection ?? ROOT_COLLECTION;
  const filterPersonalCollections = isPublicCollection(dashboardCollection)
    ? "exclude"
    : undefined;

  const initialPickerValue =
    typeof targetId === "number"
      ? { id: targetId, model: linkType === "dashboard" ? "dashboard" : "card" }
      : { id: "root", model: "collection" };

  return (
    <>
      <PickerControl
        clickBehavior={clickBehavior}
        onClick={() => setIsPickerOpen(true)}
        onCancel={handleResetLinkTargetType}
      />
      {isPickerOpen && (
        <PickerComponent
          title={getModalTitle()}
          value={initialPickerValue as any} // typescript isn't smart enough to know which picker we're using
          onChange={newTarget => {
            handleSelectLinkTargetEntityId(newTarget.id);
            setIsPickerOpen(false);
          }}
          onClose={() => setIsPickerOpen(false)}
          options={{
            showPersonalCollections: filterPersonalCollections !== "exclude",
            showRootCollection: true,
            hasConfirmButtons: false,
          }}
        />
      )}

      {isDashboard && dashboardTabs.length > 1 && (
        <Select
          error={
            dashboardTabExists
              ? undefined
              : t`The selected tab is no longer available`
          }
          data={dashboardTabs.map(tab => ({
            label: tab.name,
            value: String(tab.id),
          }))}
          label={t`Select a dashboard tab`}
          mt="md"
          value={dashboardTabIdValue}
          onChange={handleDashboardTabChange}
        />
      )}

      {hasSelectedTarget && (
        <TargetClickMappings
          isDashboard={isDashboard}
          clickBehavior={clickBehavior}
          dashcard={dashcard}
          updateSettings={updateSettings}
        />
      )}
    </>
  );
}
