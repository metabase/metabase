import React, {
  useState,
  useLayoutEffect,
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
  HeaderLastEditInfoLabel,
  HeaderCaption,
  HeaderCaptionContainer,
  DataAppTitleContainer,
  DataAppTitleSuggestions,
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
  dashcardData: object;
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
  dashcardData,
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

  useOnMount(() => {
    const timerId = setTimeout(() => {
      setShowSubHeader(false);
    }, 4000);
    return () => clearTimeout(timerId);
  });

  const isDataApp = dashboard.is_app_page;

  console.log(dashboard);
  console.log("dashboard header data", dashcardData);

  return (
    <div>
      {isEditing && (
        <EditBar
          title={editingTitle}
          subtitle={editingSubtitle}
          buttons={editingButtons}
        />
      )}
      {editWarning && <EditWarning title={editWarning} />}
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
        ref={header}
      >
        <HeaderContent showSubHeader={!isDataApp && showSubHeader}>
          <HeaderCaptionContainer>
            {isDataApp ? (
              <DataAppTitle
                title={dashboard.name}
                dashboard={dashboard}
                dashcardData={dashcardData}
                setDashboardAttribute={setDashboardAttribute}
              />
            ) : (
              <HeaderCaption
                key={dashboard.name}
                initialValue={dashboard.name}
                placeholder={t`Add title`}
                isDisabled={!dashboard.can_write}
                data-testid="dashboard-name-heading"
                onChange={handleUpdateCaption}
              />
            )}
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

interface DataAppTitleProps {
  title: string;
  dashboard: Dashboard;
  setDashboardAttribute: () => any;
  dashcardData: Record<string, never>;
}

const DataAppTitle = ({
  title,
  dashboard,
  setDashboardAttribute,
  dashcardData,
}: DataAppTitleProps) => {
  const [inputValue, setInputValue] = useState(title ?? "");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestonFocusIndex, setSuggestionFocusIndex] = useState(0);
  const [dataFieldID, setDataFieldID] = useState();
  const [dataCardID, setDataCardID] = useState();

  const suggestionTerm =
    showSuggestions &&
    inputValue.substr(inputValue.indexOf("@") + 1, inputValue.length);

  const validForSuggestions = dashboard.ordered_cards.filter(
    card => card.card.result_metadata,
  );

  console.log(validForSuggestions);

  const handleChange = ev => {
    if (ev.currentTarget.value.indexOf("@") > -1) {
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
    setInputValue(ev.currentTarget.value);
  };

  const getSuggestions = term => {
    if (inputValue.indexOf(".") > -1) {
      console.log("we be here?");
      const source =
        validForSuggestions[suggestonFocusIndex].card.result_metadata;
      console.log(source);
      return (
        <ol>
          {source.map(s => (
            <li
              key={s.id}
              onClick={() => {
                setInputValue(`${inputValue}${s.name}`);
                setDataFieldID(s.id);
                setShowSuggestions(false);
              }}
            >
              {s.name}
            </li>
          ))}
        </ol>
      );
    } else {
      return (
        <ol>
          {validForSuggestions.map((v, i) => (
            <li
              key={i}
              onClick={() => {
                setSuggestionFocusIndex(i);
                setDataCardID(v.card.id);
                setInputValue(`${inputValue}${v.card.name}.`);
              }}
            >
              {v.card.name}
            </li>
          ))}
        </ol>
      );
    }
  };

  const getDataForTitle = () => {
    const inner = Object.values(dashcardData);
    const target = inner.filter(i => {
      return Number(Object.keys(i)[0]) === dataCardID;
    });
    const f = Object.values(target[0])[0];
    const pos = f.data.cols
      .map((c, i) => (c.id === dataFieldID ? i : false))
      .filter(v => v !== false)[0];
    const val = f.data.rows[0][pos];
    return val;
  };

  return (
    <DataAppTitleContainer>
      <div className="flex align-center relative">
        <input
          value={dataFieldID ? getDataForTitle() : inputValue}
          onChange={handleChange}
          placeholder={"App title"}
          onBlur={async () => {
            await setDashboardAttribute("name", inputValue);
          }}
        />
        <span
          style={{ position: "absolute", top: 0, right: 0 }}
          onClick={() => setShowSuggestions(!showSuggestions)}
        >{`{...}`}</span>
      </div>
      {showSuggestions && (
        <DataAppTitleSuggestions>
          {getSuggestions(suggestionTerm)}
        </DataAppTitleSuggestions>
      )}
    </DataAppTitleContainer>
  );
};

export default DashboardHeader;
