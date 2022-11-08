import React, { useEffect, useMemo } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import { LocationDescriptor } from "history";

import * as Urls from "metabase/lib/urls";
import { closeNavbar, openNavbar } from "metabase/redux/app";

import { getQuestion } from "metabase/query_builder/selectors";
import { getDashboard } from "metabase/dashboard/selectors";

import type { Dashboard } from "metabase-types/api";
import type { State } from "metabase-types/store";
import type Question from "metabase-lib/Question";

import DataAppNavbarContainer from "./DataAppNavbar";
import MainNavbarContainer from "./MainNavbarContainer";

import {
  MainNavbarProps,
  MainNavbarOwnProps,
  MainNavbarDispatchProps,
  SelectedItem,
} from "./types";
import getSelectedItems from "./getSelectedItems";
import { NavRoot, Sidebar } from "./MainNavbar.styled";

interface StateProps {
  question?: Question;
  dashboard?: Dashboard;
}

interface DispatchProps {
  onChangeLocation: (location: LocationDescriptor) => void;
}

type Props = MainNavbarProps & StateProps & DispatchProps;

function mapStateToProps(state: State) {
  return {
    question: getQuestion(state),
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
    <Sidebar className="Nav" isOpen={isOpen} aria-hidden={!isOpen}>
      <NavRoot isOpen={isOpen}>
        {Urls.isLaunchedDataAppPath(location.pathname) ? (
          <DataAppNavbarContainer
            isOpen={isOpen}
            location={location}
            params={params}
            selectedItems={selectedItems}
            openNavbar={openNavbar}
            closeNavbar={closeNavbar}
            onChangeLocation={onChangeLocation}
            {...props}
          />
        ) : (
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
        )}
      </NavRoot>
    </Sidebar>
  );
}

export default connect<
  StateProps,
  MainNavbarDispatchProps & DispatchProps,
  MainNavbarOwnProps,
  State
>(
  mapStateToProps,
  mapDispatchToProps,
)(MainNavbar);
