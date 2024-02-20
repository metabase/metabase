import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import type * as React from "react";
import { t } from "ttag";
import cx from "classnames";
import type { Location } from "history";

import { color } from "metabase/lib/colors";
import type { Collection, Dashboard } from "metabase-types/api";

import EditBar from "metabase/components/EditBar";
import { PLUGIN_COLLECTION_COMPONENTS } from "metabase/plugins";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { updateDashboard } from "metabase/dashboard/actions";
import { getIsSidebarOpen } from "metabase/dashboard/selectors";

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
  headerClassName = "py1 lg-py2 xl-py3 wrapper",
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
        <EditWarning className="wrapper">
          <span>{editWarning}</span>
        </EditWarning>
      )}
      <HeaderContainer
        isFixedWidth={dashboard?.width === "fixed"}
        isSidebarOpen={isSidebarOpen}
      >
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
