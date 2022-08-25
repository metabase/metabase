import React, { useCallback, useEffect, useMemo, useState } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import Modal from "metabase/components/Modal";

import * as Urls from "metabase/lib/urls";
import { closeNavbar, openNavbar } from "metabase/redux/app";

import CollectionCreate from "metabase/collections/containers/CollectionCreate";
import { coerceCollectionId } from "metabase/collections/utils";

import { getQuestion } from "metabase/query_builder/selectors";
import { getDashboard } from "metabase/dashboard/selectors";

import Question from "metabase-lib/lib/Question";
import { Collection, Dashboard } from "metabase-types/api";
import { State } from "metabase-types/store";

import DataAppNavbarContainer from "./DataAppNavbarContainer";
import MainNavbarContainer from "./MainNavbarContainer";

import {
  MainNavbarProps,
  MainNavbarOwnProps,
  MainNavbarDispatchProps,
  SelectedItem,
} from "./types";
import { NavRoot, Sidebar } from "./MainNavbar.styled";

type NavbarModal = "MODAL_NEW_COLLECTION" | null;

interface StateProps {
  question?: Question;
  dashboard?: Dashboard;
}

type Props = MainNavbarProps & StateProps;

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

const DATA_APP_PAGE_URL_PATTERN = /\/a\/(\d+)\/page\/(\d+)/;

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
  const [modal, setModal] = useState<NavbarModal>(null);

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

  const isDataAppUrl = location.pathname.startsWith("/a/");
  const isDataAppPreview = location.pathname.startsWith("/a/preview/");

  const selectedItems = useMemo<SelectedItem[]>(() => {
    const { pathname } = location;
    const { slug } = params;
    const isCollectionPath = pathname.startsWith("/collection");
    const isUsersCollectionPath = pathname.startsWith("/collection/users");
    const isQuestionPath = pathname.startsWith("/question");
    const isModelPath = pathname.startsWith("/model");
    const isDataAppPath = pathname.startsWith("/a/");
    const isDataAppPagePath =
      DATA_APP_PAGE_URL_PATTERN.test(pathname) && typeof params.pageId;
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

  const onCreateNewCollection = useCallback(() => {
    setModal("MODAL_NEW_COLLECTION");
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  const renderModalContent = useCallback(() => {
    if (modal === "MODAL_NEW_COLLECTION") {
      return (
        <CollectionCreate
          onClose={closeModal}
          onSaved={(collection: Collection) => {
            closeModal();
            onChangeLocation(Urls.collection(collection));
          }}
        />
      );
    }
    return null;
  }, [modal, closeModal, onChangeLocation]);

  return (
    <>
      <Sidebar className="Nav" isOpen={isOpen} aria-hidden={!isOpen}>
        <NavRoot isOpen={isOpen}>
          {isDataAppUrl && !isDataAppPreview ? (
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
              onCreateNewCollection={onCreateNewCollection}
              openNavbar={openNavbar}
              closeNavbar={closeNavbar}
              onChangeLocation={onChangeLocation}
              {...props}
            />
          )}
        </NavRoot>
      </Sidebar>
      {modal && <Modal onClose={closeModal}>{renderModalContent()}</Modal>}
    </>
  );
}

export default connect<
  StateProps,
  MainNavbarDispatchProps,
  MainNavbarOwnProps,
  State
>(
  mapStateToProps,
  mapDispatchToProps,
)(MainNavbar);
