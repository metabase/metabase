import React, {
  useState,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { t } from "ttag";
import cx from "classnames";

import { useMount } from "react-use";

import { getScrollY } from "metabase/lib/dom";
import { Dashboard } from "metabase-types/api";

import EditBar from "metabase/components/EditBar";
import HeaderModal from "metabase/components/HeaderModal";
import {
  EditWarning,
  HeaderRoot,
  HeaderBadges,
  HeaderContent,
  HeaderButtonsContainer,
  HeaderButtonSection,
  HeaderLastEditInfoLabel,
  HeaderCaption,
  HeaderCaptionContainer,
} from "./DashboardHeader.styled";

interface DashboardHeaderProps {
  editingTitle: string;
  editingSubtitle: string;
  editingButtons: JSX.Element[];
  editWarning: string;
  headerButtons: React.ReactNode[];
  headerClassName: string;
  headerModalMessage: string;
  isEditing: boolean;
  isEditingInfo: boolean;
  isNavBarOpen: boolean;
  dashboard: Dashboard;
  isBadgeVisible: boolean;
  isLastEditInfoVisible: boolean;
  children: React.ReactNode;
  onHeaderModalDone: () => null;
  onHeaderModalCancel: () => null;
  onLastEditInfoClick: () => null;
  onSave: () => null;
  setDashboardAttribute: (prop: string, value: string) => null;
}

const DashboardHeader = ({
  editingTitle = "",
  editingSubtitle = "",
  editingButtons = [],
  editWarning,
  headerButtons = [],
  headerClassName = "py1 lg-py2 xl-py3 wrapper",
  headerModalMessage,
  isEditing,
  isNavBarOpen,
  dashboard,
  isLastEditInfoVisible,
  children,
  onHeaderModalDone,
  onHeaderModalCancel,
  onLastEditInfoClick,
  onSave,
  setDashboardAttribute,
}: DashboardHeaderProps) => {
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

  useMount(() => {
    const timerId = setTimeout(() => {
      setShowSubHeader(false);
    }, 4000);
    return () => clearTimeout(timerId);
  });

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
      <HeaderRoot
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
      </HeaderRoot>
      {children}
    </div>
  );
};

export default DashboardHeader;
