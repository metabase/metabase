import React, { useEffect, useMemo } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import _ from "underscore";
import type { LocationDescriptor } from "history";

import * as Urls from "metabase/lib/urls";

import { closeNavbar, openNavbar } from "metabase/redux/app";
import Questions from "metabase/entities/questions";

import { getDashboard } from "metabase/dashboard/selectors";

import type { Dashboard } from "metabase-types/api";
import type { State } from "metabase-types/store";
import Question from "metabase-lib/Question";

import MainNavbarContainer from "./MainNavbarContainer";

import {
  MainNavbarOwnProps,
  MainNavbarDispatchProps,
  SelectedItem,
} from "./types";
import getSelectedItems, {
  isModelPath,
  isQuestionPath,
} from "./getSelectedItems";
import { NavRoot, Sidebar } from "./MainNavbar.styled";

interface EntityLoaderProps {
  question?: Question;
}

interface StateProps {
  dashboard?: Dashboard;
}

interface DispatchProps extends MainNavbarDispatchProps {
  onChangeLocation: (location: LocationDescriptor) => void;
}

type Props = MainNavbarOwnProps &
  EntityLoaderProps &
  StateProps &
  DispatchProps;

function mapStateToProps(state: State) {
  return {
    // Can't use dashboard entity loader instead.
    // The dashboard page uses DashboardsApi.get directly,
    // so we can't re-use data between these components.
    dashboard: getDashboard(state),
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
  question,
  dashboard,
  openNavbar,
  closeNavbar,
  onChangeLocation,
  ...props
}: Props) {
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
        dashboard,
      }),
    [location, params, question, dashboard],
  );

  return (
    <Sidebar
      className="Nav"
      isOpen={isOpen}
      aria-hidden={!isOpen}
      data-testid="main-navbar-root"
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  connect(mapStateToProps, mapDispatchToProps),
  Questions.load({
    id: maybeGetQuestionId,
    loadingAndErrorWrapper: false,
    entityAlias: "question",
  }),
)(MainNavbar);
