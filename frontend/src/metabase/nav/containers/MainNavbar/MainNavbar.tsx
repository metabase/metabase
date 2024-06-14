import type { LocationDescriptor } from "history";
import { useEffect, useMemo } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import _ from "underscore";

import { useCollectionQuery, useQuestionQuery } from "metabase/common/hooks";
import { getDashboard } from "metabase/dashboard/selectors";
import * as Urls from "metabase/lib/urls";
import { closeNavbar, openNavbar } from "metabase/redux/app";
import type Question from "metabase-lib/v1/Question";
import type { CollectionId, Dashboard } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { NavRoot, Sidebar } from "./MainNavbar.styled";
import MainNavbarContainer from "./MainNavbarContainer";
import getSelectedItems, {
  isCollectionPath,
  isModelPath,
  isQuestionPath,
} from "./getSelectedItems";
import type {
  MainNavbarOwnProps,
  MainNavbarDispatchProps,
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
  const { data: question } = useQuestionQuery({
    id: questionId,
  });

  const { data: collection } = useCollectionQuery({
    id: collectionId,
  });

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

  const selectedItems = useMemo<SelectedItem[]>(
    () =>
      getSelectedItems({
        pathname: location.pathname,
        params,
        question,
        collection,
        dashboard,
      }),
    [location, params, question, dashboard, collection],
  );

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
  const canFetchQuestion = isQuestionPath(pathname) || isModelPath(pathname);
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
  MainNavbar,
);
