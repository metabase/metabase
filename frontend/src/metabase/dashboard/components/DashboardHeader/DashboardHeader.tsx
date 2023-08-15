import {
  useState,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
  useEffect,
} from "react";
import * as React from "react";
import { t } from "ttag";
import cx from "classnames";
import type { Location } from "history";

import { getScrollY } from "metabase/lib/dom";
import { color } from "metabase/lib/colors";
import { Collection, Dashboard } from "metabase-types/api";

import EditBar from "metabase/components/EditBar";
import HeaderModal from "metabase/components/HeaderModal";
import { PLUGIN_COLLECTION_COMPONENTS } from "metabase/plugins";
import { useDispatch } from "metabase/lib/redux";
import { updateDashboard } from "metabase/dashboard/actions";
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
} from "../DashboardHeaderView.styled";
import { DashboardTabs } from "../DashboardTabs/DashboardTabs";

interface DashboardHeaderViewProps {
  editingTitle: string;
  editingSubtitle: string;
  editingButtons: JSX.Element[];
  editWarning: string;
  headerButtons: React.ReactNode[];
  headerClassName: string;
  headerModalMessage: string;
  location: Location;
  isEditing: boolean;
  isEditingInfo: boolean;
  isNavBarOpen: boolean;
  dashboard: Dashboard;
  collection: Collection;
  isBadgeVisible: boolean;
  isLastEditInfoVisible: boolean;
  onHeaderModalDone: () => null;
  onHeaderModalCancel: () => null;
  onLastEditInfoClick: () => null;
  setDashboardAttribute: (prop: string, value: string) => null;
}

export function DashboardHeaderComponent({
  editingTitle = "",
  editingSubtitle = "",
  editingButtons = [],
  editWarning,
  headerButtons = [],
  headerClassName = "py1 lg-py2 xl-py3 wrapper",
  headerModalMessage,
  location,
  isEditing,
  isNavBarOpen,
  dashboard,
  collection,
  isLastEditInfoVisible,
  onHeaderModalDone,
  onHeaderModalCancel,
  onLastEditInfoClick,
  setDashboardAttribute,
}: DashboardHeaderViewProps) {
  const [headerHeight, setHeaderHeight] = useState(0);
  const [showSubHeader, setShowSubHeader] = useState(true);
  const header = useRef<HTMLDivElement>(null);

  const isModalOpened = headerModalMessage != null;

  const dispatch = useDispatch();

  useLayoutEffect(() => {
    if (isModalOpened) {
      const headerRect = header.current?.getBoundingClientRect();
      if (headerRect) {
        const headerHeight = headerRect.top + getScrollY();
        setHeaderHeight(headerHeight);
      }
    }
  }, [isModalOpened]);

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
      setShowSubHeader(false);
    }, 4000);
    return () => clearTimeout(timerId);
  }, []);

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
      <HeaderModal
        isOpen={!!headerModalMessage}
        height={headerHeight}
        title={headerModalMessage}
        onDone={onHeaderModalDone}
        onCancel={onHeaderModalCancel}
      />
      <div>
        <HeaderRow
          isNavBarOpen={isNavBarOpen}
          className={cx("QueryBuilder-section", headerClassName)}
          data-testid="dashboard-header"
          ref={header}
        >
          <HeaderContent hasSubHeader showSubHeader={showSubHeader}>
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
        </HeaderRow>
        <HeaderRow isNavBarOpen={isNavBarOpen}>
          <DashboardTabs location={location} isEditing={isEditing} />
        </HeaderRow>
      </div>
    </div>
  );
}
