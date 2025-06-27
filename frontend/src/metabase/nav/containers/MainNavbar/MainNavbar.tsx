import type { LocationDescriptor } from "history";
import { useEffect, useMemo, useState } from "react";
import { push } from "react-router-redux";
import _ from "underscore";

import {
  skipToken,
  useGetCardQuery,
  useGetCollectionQuery,
} from "metabase/api";
import { getDashboard } from "metabase/dashboard/selectors";
import { connect } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { closeNavbar, openNavbar } from "metabase/redux/app";
import Question from "metabase-lib/v1/Question";
import type { CollectionId, Dashboard } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { NavRoot, Sidebar } from "./MainNavbar.styled";
import MainNavbarContainer from "./MainNavbarContainer";
import getSelectedItems, {
  isCollectionPath,
  isMetricPath,
  isModelPath,
  isQuestionPath,
} from "./getSelectedItems";
import type {
  MainNavbarDispatchProps,
  MainNavbarOwnProps,
  SelectedItem,
} from "./types";

interface EntityLoaderProps {
  question?: Question;
}

interface StateProps {
  dashboard?: Dashboard;
  questionId?: number;
  collectionId?: CollectionId;
}

interface DispatchProps extends MainNavbarDispatchProps {
  onChangeLocation: (location: LocationDescriptor) => void;
}

type Props = MainNavbarOwnProps &
  EntityLoaderProps &
  StateProps &
  DispatchProps;

function mapStateToProps(state: State, props: MainNavbarOwnProps) {
  return {
    // Can't use dashboard entity loader instead.
    // The dashboard page uses DashboardsApi.get directly,
    // so we can't re-use data between these components.
    dashboard: getDashboard(state),

    questionId: maybeGetQuestionId(state, props),
    collectionId: maybeGetCollectionId(state, props),
  };
}

const mapDispatchToProps = {
  openNavbar,
  closeNavbar,
  onChangeLocation: push,
};

const MIN_SIDEBAR_WIDTH = 224;
const MAX_SIDEBAR_WIDTH = 384;
const DEFAULT_SIDEBAR_WIDTH = 324;
const SIDEBAR_WIDTH_STORAGE_KEY = "metabase.sidebarWidth";

function MainNavbar({
  isOpen,
  location,
  params,
  questionId,
  collectionId,
  dashboard,
  openNavbar,
  closeNavbar,
  onChangeLocation,
  ...props
}: Props) {
  const { currentData: card } = useGetCardQuery(
    questionId
      ? {
          id: questionId,
        }
      : skipToken,
  );

  const { currentData: collection } = useGetCollectionQuery(
    collectionId ? { id: collectionId } : skipToken,
  );

  // Sidebar width state and resizing logic
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    const parsed = stored ? parseInt(stored, 10) : DEFAULT_SIDEBAR_WIDTH;
    return isNaN(parsed)
      ? DEFAULT_SIDEBAR_WIDTH
      : Math.min(Math.max(parsed, MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH);
  });
  const [isResizing, setIsResizing] = useState(false);

  // Save width to localStorage when it changes
  useEffect(() => {
    window.localStorage.setItem(
      SIDEBAR_WIDTH_STORAGE_KEY,
      String(sidebarWidth),
    );
  }, [sidebarWidth]);

  useEffect(() => {
    function handleSidebarKeyboardShortcut(e: KeyboardEvent) {
      if (e.key === "." && (e.ctrlKey || e.metaKey)) {
        if (isOpen) {
          closeNavbar();
        } else {
          openNavbar();
        }
      }
    }

    window.addEventListener("keydown", handleSidebarKeyboardShortcut);
    return () => {
      window.removeEventListener("keydown", handleSidebarKeyboardShortcut);
    };
  }, [isOpen, openNavbar, closeNavbar]);

  useEffect(() => {
    if (!isResizing) {
      return;
    }
    function handleMouseMove(e: MouseEvent) {
      const newWidth = Math.min(
        Math.max(e.clientX, MIN_SIDEBAR_WIDTH),
        MAX_SIDEBAR_WIDTH,
      );
      setSidebarWidth(newWidth);
    }
    function handleMouseUp() {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = originalUserSelect;
    }
    // Prevent text selection while resizing
    const originalUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = originalUserSelect;
    };
  }, [isResizing]);

  // Reset width when sidebar closes (optional: comment out to persist width even when closed)
  // useEffect(() => {
  //   if (!isOpen) setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
  // }, [isOpen]);

  const selectedItems = useMemo<SelectedItem[]>(() => {
    const question = card && new Question(card);

    return getSelectedItems({
      pathname: location.pathname,
      params,
      question,
      collection,
      dashboard,
    });
  }, [location, params, card, dashboard, collection]);

  return (
    <Sidebar
      isOpen={isOpen}
      side="left"
      aria-hidden={!isOpen}
      data-testid="main-navbar-root"
      data-element-id="navbar-root"
      width={`${sidebarWidth}px`}
      style={{ minWidth: MIN_SIDEBAR_WIDTH, maxWidth: MAX_SIDEBAR_WIDTH }}
    >
      <NavRoot isOpen={isOpen}>
        <MainNavbarContainer
          isOpen={isOpen}
          location={location}
          params={params}
          selectedItems={selectedItems}
          openNavbar={openNavbar}
          closeNavbar={closeNavbar}
          onChangeLocation={onChangeLocation}
          sidebarWidth={sidebarWidth}
          {...props}
        />
      </NavRoot>
      {/* Resizer handle */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: 6,
          height: "100%",
          cursor: "ew-resize",
          zIndex: 10,
        }}
        onMouseDown={() => setIsResizing(true)}
        onClick={(e) => {
          // Only close if not a drag (i.e., not resizing)
          if (!isResizing) {
            e.stopPropagation();
            closeNavbar();
          }
        }}
        data-testid="sidebar-resizer"
      />
    </Sidebar>
  );
}

function maybeGetQuestionId(
  state: State,
  { location, params }: MainNavbarOwnProps,
) {
  const { pathname } = location;
  const canFetchQuestion =
    isQuestionPath(pathname) || isModelPath(pathname) || isMetricPath(pathname);
  return canFetchQuestion ? Urls.extractEntityId(params.slug) : null;
}

function maybeGetCollectionId(
  state: State,
  { location, params }: MainNavbarOwnProps,
) {
  const { pathname } = location;
  const canFetchQuestion = isCollectionPath(pathname);
  return canFetchQuestion ? Urls.extractEntityId(params.slug) : null;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(connect(mapStateToProps, mapDispatchToProps))(
  /**
   * Previously the `_.compose` type was broken, so it wasn't checking for type compatibility, and would
   * return the composed function type as `any`. Now that it works better, legit errors are surfacing.
   * But I don't have time, or enough context to fix this one.
   *
   * It seems the error came from the mismatch of the `dashboard` type, where the component expects
   * a dashboard response, but the injected prop is from the redux store which has a different type.
   */
  MainNavbar as any,
);
