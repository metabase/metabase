import type { LocationDescriptor } from "history";
import { useEffect, useMemo } from "react";
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
      aria-hidden={!isOpen}
      data-testid="main-navbar-root"
      data-element-id="navbar-root"
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
          {...props}
        />
      </NavRoot>
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
