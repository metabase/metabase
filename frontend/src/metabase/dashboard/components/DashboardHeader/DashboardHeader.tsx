import type { CSSProperties } from "react";
import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { t } from "ttag";
import cx from "classnames";
import type { Location } from "history";
import { WidthChangeButton } from "metabase/dashboard/components/DashboardHeader/WidthChangeButton";

import type { Dashboard } from "metabase-types/api";

import EditBar from "metabase/components/EditBar";
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
  location: Location;
  isEditing: boolean;
  maxWidth: CSSProperties["maxWidth"];
  setMaxWidth: (val: CSSProperties["maxWidth"]) => void;
  isEditingInfo: boolean;
  isNavBarOpen: boolean;
  dashboard: Dashboard;
  isBadgeVisible: boolean;
  isLastEditInfoVisible: boolean;
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
  location,
  isEditing,
  maxWidth,
  isNavBarOpen,
  dashboard,
  isLastEditInfoVisible,
  onLastEditInfoClick,
  setDashboardAttribute,
  setMaxWidth,
}: DashboardHeaderViewProps) {
  const [showSubHeader, setShowSubHeader] = useState(true);
  const header = useRef<HTMLDivElement>(null);
  const dispatch = useDispatch();

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
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
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
      <div style={{ width: `min(${maxWidth}, 100%)` ?? "100%" }}>
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
            <WidthChangeButton maxWidth={maxWidth} setMaxWidth={setMaxWidth} />
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
