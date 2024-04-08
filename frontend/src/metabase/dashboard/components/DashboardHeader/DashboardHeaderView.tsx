import cx from "classnames";
import type { Location } from "history";
import type * as React from "react";
import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { t } from "ttag";

import EditBar from "metabase/components/EditBar";
import CS from "metabase/css/core/index.css";
import { updateDashboard } from "metabase/dashboard/actions";
import {
  getIsHeaderVisible,
  getIsSidebarOpen,
} from "metabase/dashboard/selectors";
import { color } from "metabase/lib/colors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { PLUGIN_COLLECTION_COMPONENTS } from "metabase/plugins";
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
import { DashboardTabs } from "../../components/DashboardTabs/DashboardTabs";

interface DashboardHeaderViewProps {
  editingTitle?: string;
  editingSubtitle?: string;
  editingButtons?: JSX.Element[];
  editWarning?: string;
  headerButtons?: React.ReactNode[];
  headerClassName: string;
  location: Location;
  isEditing: boolean;
  isEditingInfo: boolean;
  isNavBarOpen: boolean;
  dashboard: Dashboard;
  collection: Collection;
  isBadgeVisible: boolean;
  isLastEditInfoVisible: boolean;
  onLastEditInfoClick: () => void;
  setDashboardAttribute: <Key extends keyof Dashboard>(
    key: Key,
    value: Dashboard[Key],
  ) => void;
}

export function DashboardHeaderComponent({
  editingTitle = "",
  editingSubtitle = "",
  editingButtons = [],
  editWarning,
  headerButtons = [],
  headerClassName = cx(CS.py1, CS.lgPy2, CS.xlPy3, CS.wrapper),
  location,
  isEditing,
  isNavBarOpen,
  dashboard,
  collection,
  isLastEditInfoVisible,
  onLastEditInfoClick,
  setDashboardAttribute,
}: DashboardHeaderViewProps) {
  const [showSubHeader, setShowSubHeader] = useState(true);
  const header = useRef<HTMLDivElement>(null);
  const dispatch = useDispatch();

  const isSidebarOpen = useSelector(getIsSidebarOpen);
  const isDashboardHeaderVisible = useSelector(getIsHeaderVisible);

  const _headerButtons = useMemo(
    () => (
      <HeaderButtonSection
        className="Header-buttonSection"
        isNavBarOpen={isNavBarOpen}
      >
        {headerButtons}
      </HeaderButtonSection>
    ),
    [headerButtons, isNavBarOpen],
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
            className={cx("QueryBuilder-section", headerClassName)}
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
            <DashboardTabs
              dashboardId={dashboard.id}
              location={location}
              isEditing={isEditing}
            />
          </HeaderFixedWidthContainer>
        </HeaderRow>
      </HeaderContainer>
    </div>
  );
}
