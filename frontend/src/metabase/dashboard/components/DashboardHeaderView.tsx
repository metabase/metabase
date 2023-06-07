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

import { getScrollY } from "metabase/lib/dom";
import { Dashboard } from "metabase-types/api";

import EditBar from "metabase/components/EditBar";
import HeaderModal from "metabase/components/HeaderModal";
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
} from "./DashboardHeaderView.styled";
import { DashboardTabs } from "./DashboardTabs/DashboardTabs";

interface DashboardHeaderViewProps {
  editingTitle: string;
  editingSubtitle: string;
  editingButtons: JSX.Element[];
  editWarning: string;
  headerButtons: React.ReactNode[];
  headerClassName: string;
  headerModalMessage: string;
  tabSlug: string | undefined;
  isEditing: boolean;
  isEditingInfo: boolean;
  isNavBarOpen: boolean;
  dashboard: Dashboard;
  isBadgeVisible: boolean;
  isLastEditInfoVisible: boolean;
  onHeaderModalDone: () => null;
  onHeaderModalCancel: () => null;
  onLastEditInfoClick: () => null;
  onSave: () => null;
  setDashboardAttribute: (prop: string, value: string) => null;
}

function DashboardHeaderView({
  editingTitle = "",
  editingSubtitle = "",
  editingButtons = [],
  editWarning,
  headerButtons = [],
  headerClassName = "py1 lg-py2 xl-py3 wrapper",
  headerModalMessage,
  tabSlug,
  isEditing,
  isNavBarOpen,
  dashboard,
  isLastEditInfoVisible,
  onHeaderModalDone,
  onHeaderModalCancel,
  onLastEditInfoClick,
  onSave,
  setDashboardAttribute,
}: DashboardHeaderViewProps) {
  const [headerHeight, setHeaderHeight] = useState(0);
  const [showSubHeader, setShowSubHeader] = useState(true);
  const header = useRef<HTMLDivElement>(null);

  const isModalOpened = headerModalMessage != null;

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
        await onSave();
      }
    },
    [setDashboardAttribute, onSave, isEditing],
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
          <DashboardTabs slug={tabSlug} isEditing={isEditing} />
        </HeaderRow>
      </div>
    </div>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DashboardHeaderView;
