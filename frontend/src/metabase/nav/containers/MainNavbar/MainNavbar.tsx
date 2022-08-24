import React, { useCallback, useState } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import Modal from "metabase/components/Modal";

import * as Urls from "metabase/lib/urls";
import { closeNavbar, openNavbar } from "metabase/redux/app";

import CollectionCreate from "metabase/collections/containers/CollectionCreate";

import { Collection } from "metabase-types/api";
import { State } from "metabase-types/store";

import DataAppNavbarContainer from "./DataAppNavbarContainer";
import MainNavbarContainer from "./MainNavbarContainer";

import {
  MainNavbarProps,
  MainNavbarOwnProps,
  MainNavbarDispatchProps,
} from "./types";
import { NavRoot, Sidebar } from "./MainNavbar.styled";

type NavbarModal = "MODAL_NEW_COLLECTION" | null;

const mapDispatchToProps = {
  openNavbar,
  closeNavbar,
  onChangeLocation: push,
};

function MainNavbar({
  isOpen,
  location,
  onChangeLocation,
  ...props
}: MainNavbarProps) {
  const [modal, setModal] = useState<NavbarModal>(null);

  const isDataAppUrl = location.pathname.startsWith("/a/");
  const isDataAppPreview = location.pathname.startsWith("/a/preview/");

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
              onChangeLocation={onChangeLocation}
              {...props}
            />
          ) : (
            <MainNavbarContainer
              isOpen={isOpen}
              location={location}
              onCreateNewCollection={onCreateNewCollection}
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
  unknown,
  MainNavbarDispatchProps,
  MainNavbarOwnProps,
  State
>(
  null,
  mapDispatchToProps,
)(MainNavbar);
