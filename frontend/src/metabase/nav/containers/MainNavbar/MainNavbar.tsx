import React, { useEffect, useMemo } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import { LocationDescriptor } from "history";

import * as Urls from "metabase/lib/urls";

import { closeNavbar, openNavbar } from "metabase/redux/app";
import Questions from "metabase/entities/questions";

import { getCard as getQueryBuilderCard } from "metabase/query_builder/selectors";
import { getDashboard } from "metabase/dashboard/selectors";

import type { Card, Dashboard } from "metabase-types/api";
import type { State } from "metabase-types/store";

import MainNavbarContainer from "./MainNavbarContainer";

import {
  MainNavbarProps,
  MainNavbarOwnProps,
  MainNavbarDispatchProps,
  SelectedItem,
} from "./types";
import getSelectedItems, { isModelDetailPath } from "./getSelectedItems";
import { NavRoot, Sidebar } from "./MainNavbar.styled";

interface StateProps {
  card?: Card;
  dashboard?: Dashboard;
}

interface DispatchProps {
  onChangeLocation: (location: LocationDescriptor) => void;
}

type Props = MainNavbarProps & StateProps & DispatchProps;

function getModelDetailPageCard(state: State, params: { slug?: string }) {
  const entityId = Urls.extractEntityId(params.slug);
  return Questions.selectors.getObject(state, { entityId });
}

function mapStateToProps(
  state: State,
  { location, params }: MainNavbarOwnProps,
) {
  const isModelDetailPage = isModelDetailPath(location.pathname);
  return {
    card: isModelDetailPage
      ? getModelDetailPageCard(state, params)
      : getQueryBuilderCard(state),
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
  card,
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
        card,
        dashboard,
      }),
    [location, params, card, dashboard],
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

export default connect<
  StateProps,
  MainNavbarDispatchProps & DispatchProps,
  MainNavbarOwnProps,
  State
>(
  mapStateToProps,
  mapDispatchToProps,
)(MainNavbar);
