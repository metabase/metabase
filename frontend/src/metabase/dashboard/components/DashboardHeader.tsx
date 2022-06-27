import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { t } from "ttag";
import cx from "classnames";

import { useOnMount } from "metabase/hooks/use-on-mount";

import { getScrollY } from "metabase/lib/dom";
import { Dashboard } from "metabase-types/api";

import EditBar from "metabase/components/EditBar";
import EditWarning from "metabase/components/EditWarning";
import HeaderModal from "metabase/components/HeaderModal";
import {
  HeaderRoot,
  HeaderBadges,
  HeaderContent,
  HeaderButtonsContainer,
  HeaderButtonSection,
  StyledLastEditInfoLabel,
  HeaderCaption,
  HeaderCaptionContainer,
} from "./DashboardHeader.styled";

interface HeaderProps {
  editingTitle: string;
  editingSubtitle: string;
  editingButtons: JSX.Element[];
  editWarning: string;
  headerButtons: React.ReactNode[][];
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

const Header = ({
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
}: HeaderProps) => {
  const [headerHeight, setHeaderHeight] = useState(0);
  const [showSubHeader, setShowSubHeader] = useState(true);
  const header = useRef<HTMLDivElement>(null);

  const updateHeaderHeight = useCallback(() => {
    if (!header.current) {
      return;
    }

    const rect = header.current?.getBoundingClientRect();
    const _headerHeight = rect.top + getScrollY();
    if (headerHeight !== _headerHeight) {
      setHeaderHeight(_headerHeight);
    }
  }, [headerHeight, setHeaderHeight]);

  useEffect(() => {
    const modalIsOpen = !!headerModalMessage;
    if (modalIsOpen) {
      updateHeaderHeight();
    }
  }, [headerModalMessage, updateHeaderHeight]);

  const renderEditHeader = useCallback(() => {
    if (isEditing) {
      return (
        <EditBar
          title={editingTitle}
          subtitle={editingSubtitle}
          buttons={editingButtons}
        />
      );
    }
  }, [isEditing, editingTitle, editingSubtitle, editingButtons]);

  const renderEditWarning = useCallback(() => {
    if (editWarning) {
      return <EditWarning title={editWarning} />;
    }
  }, [editWarning]);

  const renderHeaderModal = useCallback(() => {
    return (
      <HeaderModal
        isOpen={!!headerModalMessage}
        height={headerHeight}
        title={headerModalMessage}
        onDone={onHeaderModalDone}
        onCancel={onHeaderModalCancel}
      />
    );
  }, [
    headerModalMessage,
    headerHeight,
    onHeaderModalCancel,
    onHeaderModalDone,
  ]);

  const _headerButtons = useMemo(
    () =>
      headerButtons.map((section, sectionIndex) => {
        return (
          section.length > 0 && (
            <HeaderButtonSection
              key={sectionIndex}
              className="Header-buttonSection"
              isNavBarOpen={isNavBarOpen}
            >
              {section}
            </HeaderButtonSection>
          )
        );
      }),
    [headerButtons, isNavBarOpen],
  );

  const handleUpdateCaption = useCallback(
    async (name: string) => {
      await setDashboardAttribute("name", name);
      await onSave();
    },
    [setDashboardAttribute, onSave],
  );

  useOnMount(() => {
    const timerId = setTimeout(() => {
      setShowSubHeader(false);
    }, 4000);
    return () => clearTimeout(timerId);
  });

  return (
    <div>
      {renderEditHeader()}
      {renderEditWarning()}
      {renderHeaderModal()}
      <HeaderRoot
        isNavBarOpen={isNavBarOpen}
        className={cx("QueryBuilder-section", headerClassName)}
        ref={header}
      >
        <HeaderContent showSubHeader={showSubHeader}>
          <HeaderCaptionContainer>
            <HeaderCaption
              key={dashboard.id}
              initialValue={dashboard.name}
              placeholder={t`Add title`}
              isDisabled={!dashboard.can_write}
              data-testid="dashboard-name-heading"
              onChange={handleUpdateCaption}
            />
          </HeaderCaptionContainer>
          <HeaderBadges>
            {isLastEditInfoVisible && (
              <StyledLastEditInfoLabel
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

export default Header;
