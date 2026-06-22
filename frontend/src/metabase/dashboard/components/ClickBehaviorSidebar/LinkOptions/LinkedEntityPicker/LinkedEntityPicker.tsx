import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { skipToken, useGetCardQuery, useGetDashboardQuery } from "metabase/api";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { isPublicCollection } from "metabase/common/collections/utils";
import { DashboardName } from "metabase/common/components/DashboardName";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  DashboardPickerModal,
  QuestionPickerModal,
} from "metabase/common/components/Pickers";
import { QuestionName } from "metabase/common/components/QuestionName";
import CS from "metabase/css/core/index.css";
import {
  ClickMappings,
  clickTargetObjectType,
} from "metabase/dashboard/components/ClickMappings";
import { getDashboard } from "metabase/dashboard/selectors";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Button, Icon, Select } from "metabase/ui";
import { checkNotNull } from "metabase/utils/types";
import Question from "metabase-lib/v1/Question";
import type {
  CardId,
  ClickBehavior,
  Dashboard,
  DashboardCard,
  DashboardId,
  DashboardTab,
  EntityCustomDestinationClickBehavior,
} from "metabase-types/api";

import { Heading } from "../../ClickBehaviorSidebarComponents";
import { SidebarItem } from "../../SidebarItem";
import S from "../LinkOptions.module.css";

const LINK_TARGETS = {
  // TODO: we can probably just have one picker to pick either a question or a dashboard
  question: {
    Name: ({ id }: { id: CardId | DashboardId | undefined }) => (
      <QuestionName id={id as CardId | undefined} />
    ),
    PickerComponent: QuestionPickerModal,
    pickerIcon: "bar" as const,
    getModalTitle: () => t`Pick a question to link to`,
    getPickerButtonLabel: () => t`Pick a question…`,
  },
  dashboard: {
    Name: ({ id }: { id: CardId | DashboardId | undefined }) => (
      <DashboardName id={id as DashboardId | undefined} />
    ),
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
  const { Name, pickerIcon, getPickerButtonLabel } =
    LINK_TARGETS[clickBehavior.linkType];

  const renderLabel = useCallback(() => {
    const hasSelectedTarget = clickBehavior.targetId != null;
    if (hasSelectedTarget) {
      return <Name id={clickBehavior.targetId} />;
    }
    return getPickerButtonLabel();
  }, [Name, clickBehavior.targetId, getPickerButtonLabel]);

  return (
    <Button.Group>
      <Button
        onClick={onClick}
        justify="flex-start"
        leftSection={<Icon name={pickerIcon} />}
        rightSection={<Icon name="chevrondown" size={12} />}
        size="lg"
        variant="filled"
        classNames={{
          root: S.ButtonRoot,
          label: S.ButtonLabel,
        }}
        w="100%"
      >
        <SidebarItem.Name>{renderLabel()}</SidebarItem.Name>
      </Button>
      <Button
        onClick={onCancel}
        miw="3rem"
        size="lg"
        variant="filled"
        rightSection={<Icon name="close" />}
      />
    </Button.Group>
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
  clickBehavior,
  dashcard,
  updateSettings,
}: {
  clickBehavior: EntityCustomDestinationClickBehavior;
  dashcard: DashboardCard;
  updateSettings: (settings: Partial<ClickBehavior>) => void;
}) {
  const isDashboard = clickBehavior.linkType === "dashboard";
  const {
    data: dashboard,
    isLoading: dashboardIsLoading,
    error: dashboardError,
  } = useGetDashboardQuery(
    isDashboard && clickBehavior.targetId != null
      ? { id: clickBehavior.targetId }
      : skipToken,
  );
  const {
    data: card,
    isLoading: cardIsLoading,
    error: cardError,
  } = useGetCardQuery(
    !isDashboard && clickBehavior.targetId != null
      ? { id: clickBehavior.targetId }
      : skipToken,
  );
  const metadata = useSelector(getMetadata);
  const question = useMemo(() => {
    return card ? new Question(card, metadata) : undefined;
  }, [card, metadata]);

  const object = isDashboard ? dashboard : question;
  const isLoading = isDashboard ? dashboardIsLoading : cardIsLoading;
  const error = isDashboard ? dashboardError : cardError;

  if (error || isLoading) {
    return <LoadingAndErrorWrapper error={error} loading={isLoading} />;
  }

  return (
    <div className={CS.pt1}>
      <Heading>{getTargetClickMappingsHeading(checkNotNull(object))}</Heading>
      <ClickMappings
        object={object}
        dashcard={dashcard}
        isDashboard={isDashboard}
        clickBehavior={clickBehavior}
        updateSettings={updateSettings}
      />
    </div>
  );
}

export function LinkedEntityPicker({
  dashcard,
  clickBehavior,
  updateSettings,
}: {
  dashcard: DashboardCard;
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

  const { currentData: targetDashboard } = useGetDashboardQuery(
    isDashboard && targetId != null ? { id: targetId } : skipToken,
  );
  const dashboardTabs = targetDashboard?.tabs ?? NO_DASHBOARD_TABS;
  const defaultDashboardTabId: number | undefined = dashboardTabs[0]?.id;
  const dashboardTabId = isDashboard
    ? (clickBehavior.tabId ?? defaultDashboardTabId)
    : undefined;
  const dashboardTabExists = dashboardTabs.some(
    (tab) => tab.id === dashboardTabId,
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
          onChange={(newTarget) => {
            handleSelectLinkTargetEntityId(newTarget.id);
            setIsPickerOpen(false);
          }}
          onClose={() => setIsPickerOpen(false)}
          options={{
            hasPersonalCollections: filterPersonalCollections !== "exclude",
            hasRootCollection: true,
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
          data={dashboardTabs.map((tab) => ({
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
          clickBehavior={clickBehavior}
          dashcard={dashcard}
          updateSettings={updateSettings}
        />
      )}
    </>
  );
}
