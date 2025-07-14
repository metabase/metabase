import cx from "classnames";
import type { JSX } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isInstanceAnalyticsCollection } from "metabase/collections/utils";
import EditBar from "metabase/common/components/EditBar";
import LastEditInfoLabel from "metabase/common/components/LastEditInfoLabel";
import CS from "metabase/css/core/index.css";
import {
  applyDraftParameterValues,
  resetParameters,
} from "metabase/dashboard/actions";
import { DashboardHeaderButtonRow } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/DashboardHeaderButtonRow";
import { useDashboardContext } from "metabase/dashboard/context";
import {
  getCanResetFilters,
  getIsEditing,
  getIsHeaderVisible,
  getIsShowDashboardInfoSidebar,
  getIsShowDashboardSettingsSidebar,
  getIsSidebarOpen,
} from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  PLUGIN_COLLECTION_COMPONENTS,
  PLUGIN_MODERATION,
} from "metabase/plugins";
import { getIsNavbarOpen } from "metabase/selectors/app";
import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";
import { Box, Flex } from "metabase/ui";
import type { Collection, Dashboard as IDashboard } from "metabase-types/api";

import { Dashboard } from "../Dashboard";
import { FixedWidthContainer } from "../Dashboard/DashboardComponents";
import { SIDEBAR_WIDTH } from "../Sidebar";

import S from "./DashboardHeaderView.module.css";

type DashboardHeaderViewProps = {
  editingTitle?: string;
  editingButtons?: JSX.Element[];
  editWarning?: string;
  dashboard: IDashboard;
  collection: Collection;
  isBadgeVisible: boolean;
  isLastEditInfoVisible: boolean;
  onLastEditInfoClick?: () => void;
};

export function DashboardHeaderView({
  editingTitle = "",
  editingButtons = [],
  editWarning,
  dashboard,
  collection,
  isLastEditInfoVisible,
  onLastEditInfoClick,
}: DashboardHeaderViewProps) {
  const { titled } = useDashboardContext();

  const isNavBarOpen = useSelector(getIsNavbarOpen);
  const isEditing = useSelector(getIsEditing);

  const [showSubHeader, setShowSubHeader] = useState(true);
  const header = useRef<HTMLDivElement>(null);
  const dispatch = useDispatch();

  const canResetFilters = useSelector(getCanResetFilters);
  const isSidebarOpen = useSelector(getIsSidebarOpen);
  const isInfoSidebarOpen = useSelector(getIsShowDashboardInfoSidebar);
  const isSettingsSidebarOpen = useSelector(getIsShowDashboardSettingsSidebar);

  const isDashboardHeaderVisible = useSelector(getIsHeaderVisible);

  const isAnalyticsDashboard = isInstanceAnalyticsCollection(collection);

  const handleResetFilters = useCallback(async () => {
    await dispatch(resetParameters());
    await dispatch(applyDraftParameterValues());
  }, [dispatch]);

  const _headerButtons = useMemo(
    () => (
      <Flex
        className={cx("Header-buttonSection", S.HeaderButtonSection, {
          [S.isNavBarOpen]: isNavBarOpen,
        })}
      >
        <DashboardHeaderButtonRow
          canResetFilters={canResetFilters}
          onResetFilters={handleResetFilters}
          isAnalyticsDashboard={isAnalyticsDashboard}
        />
      </Flex>
    ),
    [canResetFilters, handleResetFilters, isAnalyticsDashboard, isNavBarOpen],
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
      {isEditing && <EditBar title={editingTitle} buttons={editingButtons} />}
      {editWarning && (
        <Flex className={cx(CS.wrapper, S.EditWarning)}>
          <span>{editWarning}</span>
        </Flex>
      )}
      <div
        className={cx(S.HeaderContainer, {
          [S.isFixedWidth]: dashboard?.width === "fixed",
          [S.offsetSidebar]:
            isSidebarOpen && !isInfoSidebarOpen && !isSettingsSidebarOpen,
        })}
        style={
          {
            "--sidebar-width": `${SIDEBAR_WIDTH}px`,
          } as React.CSSProperties
        }
      >
        {isDashboardHeaderVisible && (
          <FullWidthContainer
            className={cx(CS.wrapper, S.HeaderRow)}
            data-testid="dashboard-header"
            ref={header}
          >
            <FixedWidthContainer
              className={cx(S.HeaderFixedWidthContainer, {
                [S.isNavBarOpen]: isNavBarOpen,
              })}
              data-testid="fixed-width-dashboard-header"
              isFixedWidth={dashboard?.width === "fixed"}
            >
              {titled && (
                <Box
                  role="heading"
                  className={cx(S.HeaderContent, {
                    [S.showSubHeader]: showSubHeader,
                  })}
                >
                  <Flex className={S.HeaderCaptionContainer}>
                    <Dashboard.Title className={S.HeaderCaption} />
                    <PLUGIN_MODERATION.EntityModerationIcon
                      dashboard={dashboard}
                    />
                    <PLUGIN_COLLECTION_COMPONENTS.CollectionInstanceAnalyticsIcon
                      color="brand"
                      collection={collection}
                      entity="dashboard"
                    />
                  </Flex>
                  <Flex className={S.HeaderBadges}>
                    {isLastEditInfoVisible && (
                      <LastEditInfoLabel
                        className={S.HeaderLastEditInfoLabel}
                        item={dashboard}
                        onClick={onLastEditInfoClick}
                      />
                    )}
                  </Flex>
                </Box>
              )}

              <Flex
                className={cx(S.HeaderButtonsContainer, {
                  [S.isNavBarOpen]: isNavBarOpen,
                })}
              >
                {_headerButtons}
              </Flex>
            </FixedWidthContainer>
          </FullWidthContainer>
        )}
        <FullWidthContainer className={S.HeaderRow}>
          <FixedWidthContainer
            className={cx(S.HeaderFixedWidthContainer, {
              [S.isNavBarOpen]: isNavBarOpen,
            })}
            data-testid="fixed-width-dashboard-tabs"
            isFixedWidth={dashboard?.width === "fixed"}
          >
            <Dashboard.Tabs />
          </FixedWidthContainer>
        </FullWidthContainer>
      </div>
    </div>
  );
}
