import cx from "classnames";
import type { JSX } from "react";
import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { t } from "ttag";

import { isInstanceAnalyticsCollection } from "metabase/collections/utils";
import EditBar from "metabase/components/EditBar";
import CS from "metabase/css/core/index.css";
import {
  applyDraftParameterValues,
  resetParameters,
  updateDashboard,
} from "metabase/dashboard/actions";
import { useSetDashboardAttributeHandler } from "metabase/dashboard/components/Dashboard/use-set-dashboard-attribute";
import { DashboardHeaderButtonRow } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/DashboardHeaderButtonRow";
import { DashboardTabs } from "metabase/dashboard/components/DashboardTabs";
import {
  getCanResetFilters,
  getIsEditing,
  getIsHeaderVisible,
  getIsSidebarOpen,
} from "metabase/dashboard/selectors";
import type {
  DashboardFullscreenControls,
  DashboardRefreshPeriodControls,
  DashboardNightModeControls,
} from "metabase/dashboard/types";
import { color } from "metabase/lib/colors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { PLUGIN_COLLECTION_COMPONENTS } from "metabase/plugins";
import { getIsNavbarOpen } from "metabase/selectors/app";
import type { Collection, Dashboard } from "metabase-types/api";

import {
  EditWarning,
  HeaderRow,
  HeaderBadges,
  HeaderContent,
  HeaderButtonsContainer,
  HeaderButtonSection,
  HeaderLastEditInfoLabel,
  HeaderCaption,
  HeaderCaptionContainer,
  HeaderFixedWidthContainer,
  HeaderContainer,
} from "../../components/DashboardHeaderView.styled";

type DashboardHeaderViewProps = {
  editingTitle?: string;
  editingSubtitle?: string;
  editingButtons?: JSX.Element[];
  editWarning?: string;
  dashboard: Dashboard;
  collection: Collection;
  isBadgeVisible: boolean;
  isLastEditInfoVisible: boolean;
  onLastEditInfoClick: () => void;
} & DashboardFullscreenControls &
  DashboardRefreshPeriodControls &
  DashboardNightModeControls;

export function DashboardHeaderView({
  editingTitle = "",
  editingSubtitle = "",
  editingButtons = [],
  editWarning,
  dashboard,
  collection,
  isLastEditInfoVisible,
  onLastEditInfoClick,
  refreshPeriod,
  onRefreshPeriodChange,
  setRefreshElapsedHook,
  isFullscreen,
  onFullscreenChange,
  isNightMode,
  onNightModeChange,
  hasNightModeToggle,
}: DashboardHeaderViewProps) {
  const isNavBarOpen = useSelector(getIsNavbarOpen);
  const isEditing = useSelector(getIsEditing);

  const setDashboardAttribute = useSetDashboardAttributeHandler();
  const [showSubHeader, setShowSubHeader] = useState(true);
  const header = useRef<HTMLDivElement>(null);
  const dispatch = useDispatch();

  const canResetFilters = useSelector(getCanResetFilters);
  const isSidebarOpen = useSelector(getIsSidebarOpen);
  const isDashboardHeaderVisible = useSelector(getIsHeaderVisible);
  const isAnalyticsDashboard = isInstanceAnalyticsCollection(collection);

  const handleResetFilters = useCallback(async () => {
    await dispatch(resetParameters());
    await dispatch(applyDraftParameterValues());
  }, [dispatch]);

  const _headerButtons = useMemo(
    () => (
      <HeaderButtonSection
        className="Header-buttonSection"
        isNavBarOpen={isNavBarOpen}
      >
        <DashboardHeaderButtonRow
          canResetFilters={canResetFilters}
          onResetFilters={handleResetFilters}
          refreshPeriod={refreshPeriod}
          onRefreshPeriodChange={onRefreshPeriodChange}
          setRefreshElapsedHook={setRefreshElapsedHook}
          isFullscreen={isFullscreen}
          onFullscreenChange={onFullscreenChange}
          isNightMode={isNightMode}
          onNightModeChange={onNightModeChange}
          hasNightModeToggle={hasNightModeToggle}
          isAnalyticsDashboard={isAnalyticsDashboard}
        />
      </HeaderButtonSection>
    ),
    [
      canResetFilters,
      handleResetFilters,
      hasNightModeToggle,
      isAnalyticsDashboard,
      isFullscreen,
      isNavBarOpen,
      isNightMode,
      onFullscreenChange,
      onNightModeChange,
      onRefreshPeriodChange,
      refreshPeriod,
      setRefreshElapsedHook,
    ],
  );

  const handleUpdateCaption = useCallback(
    async (name: string) => {
      await setDashboardAttribute("name", name);
      if (!isEditing) {
        await dispatch(updateDashboard({ attributeNames: ["name"] }));
      }
    },
    [setDashboardAttribute, isEditing, dispatch],
  );

  useEffect(() => {
    const timerId = setTimeout(() => {
      if (isLastEditInfoVisible) {
        setShowSubHeader(false);
      }
    }, 4000);
    return () => clearTimeout(timerId);
  }, [isLastEditInfoVisible]);

  return (
    <div>
      {isEditing && (
        <EditBar
          title={editingTitle}
          subtitle={editingSubtitle}
          buttons={editingButtons}
        />
      )}
      {editWarning && (
        <EditWarning className={CS.wrapper}>
          <span>{editWarning}</span>
        </EditWarning>
      )}
      <HeaderContainer
        isFixedWidth={dashboard?.width === "fixed"}
        isSidebarOpen={isSidebarOpen}
      >
        {isDashboardHeaderVisible && (
          <HeaderRow
            className={cx("QueryBuilder-section", CS.wrapper)}
            data-testid="dashboard-header"
            ref={header}
          >
            <HeaderFixedWidthContainer
              data-testid="fixed-width-dashboard-header"
              isNavBarOpen={isNavBarOpen}
              isFixedWidth={dashboard?.width === "fixed"}
            >
              <HeaderContent
                role="heading"
                hasSubHeader
                showSubHeader={showSubHeader}
              >
                <HeaderCaptionContainer>
                  <HeaderCaption
                    key={dashboard.name}
                    initialValue={dashboard.name}
                    placeholder={t`Add title`}
                    isDisabled={!dashboard.can_write}
                    data-testid="dashboard-name-heading"
                    onChange={handleUpdateCaption}
                  />
                  <PLUGIN_COLLECTION_COMPONENTS.CollectionInstanceAnalyticsIcon
                    color={color("brand")}
                    collection={collection}
                    entity="dashboard"
                  />
                </HeaderCaptionContainer>
                <HeaderBadges>
                  {isLastEditInfoVisible && (
                    <HeaderLastEditInfoLabel
                      item={dashboard}
                      onClick={onLastEditInfoClick}
                      className=""
                    />
                  )}
                </HeaderBadges>
              </HeaderContent>

              <HeaderButtonsContainer isNavBarOpen={isNavBarOpen}>
                {_headerButtons}
              </HeaderButtonsContainer>
            </HeaderFixedWidthContainer>
          </HeaderRow>
        )}
        <HeaderRow>
          <HeaderFixedWidthContainer
            data-testid="fixed-width-dashboard-tabs"
            isNavBarOpen={isNavBarOpen}
            isFixedWidth={dashboard?.width === "fixed"}
          >
            <DashboardTabs dashboardId={dashboard.id} isEditing={isEditing} />
          </HeaderFixedWidthContainer>
        </HeaderRow>
      </HeaderContainer>
    </div>
  );
}
