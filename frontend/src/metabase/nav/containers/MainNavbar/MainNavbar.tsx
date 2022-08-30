import React, { useEffect, useMemo } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import { LocationDescriptor } from "history";

import * as Urls from "metabase/lib/urls";
import { closeNavbar, openNavbar } from "metabase/redux/app";

import { coerceCollectionId } from "metabase/collections/utils";

import { getQuestion } from "metabase/query_builder/selectors";
import { getDashboard } from "metabase/dashboard/selectors";

import type Question from "metabase-lib/lib/Question";
import type { Dashboard } from "metabase-types/api";
import type { State } from "metabase-types/store";

import DataAppNavbarContainer from "./DataAppNavbarContainer";
import MainNavbarContainer from "./MainNavbarContainer";

import {
  MainNavbarProps,
  MainNavbarOwnProps,
  MainNavbarDispatchProps,
  SelectedItem,
} from "./types";
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

  const selectedItems = useMemo<SelectedItem[]>(() => {
    const { pathname } = location;
    const { slug } = params;
    const isCollectionPath = pathname.startsWith("/collection");
    const isUsersCollectionPath = pathname.startsWith("/collection/users");
    const isQuestionPath = pathname.startsWith("/question");
    const isModelPath = pathname.startsWith("/model");
    const isDataAppPath = Urls.isDataAppPath(pathname);
    const isDataAppPagePath = Urls.isDataAppPagePath(pathname);
    const isDashboardPath = pathname.startsWith("/dashboard");

    if (isCollectionPath) {
      return [
        {
          id: isUsersCollectionPath ? "users" : Urls.extractCollectionId(slug),
          type: "collection",
        },
      ];
    }
    if (isDataAppPagePath) {
      return [
        {
          id: parseInt(params.pageId as string),
          type: "data-app-page",
        },
      ];
    }
    if (isDataAppPath) {
      return [
        {
          id: Urls.extractEntityId(slug),
          type: "data-app",
        },
      ];
    }
    if (isDashboardPath && dashboard) {
      return [
        {
          id: dashboard.id,
          type: "dashboard",
        },
        {
          id: coerceCollectionId(dashboard.collection_id),
          type: "collection",
        },
      ];
    }
    if ((isQuestionPath || isModelPath) && question) {
      return [
        {
          id: question.id(),
          type: "card",
        },
        {
          id: coerceCollectionId(question.collectionId()),
          type: "collection",
        },
      ];
    }
    return [{ url: pathname, type: "non-entity" }];
  }, [location, params, question, dashboard]);

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
