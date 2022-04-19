import React, { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import { LocationDescriptor } from "history";

import Modal from "metabase/components/Modal";
import CreateDashboardModal from "metabase/components/CreateDashboardModal";

import { Collection } from "metabase-types/api";
import { State } from "metabase-types/store";

import CollectionCreate from "metabase/collections/containers/CollectionCreate";

import { closeNavbar } from "metabase/redux/app";
import * as Urls from "metabase/lib/urls";
import {
  getHasDataAccess,
  getHasNativeWrite,
  getHasDbWithJsonEngine,
} from "metabase/new_query/selectors";

import { Menu, StyledButton, Title } from "./NewButton.styled";

type NewButtonModal = "MODAL_NEW_DASHBOARD" | "MODAL_NEW_COLLECTION" | null;

const MODAL_NEW_DASHBOARD: NewButtonModal = "MODAL_NEW_DASHBOARD";
const MODAL_NEW_COLLECTION: NewButtonModal = "MODAL_NEW_COLLECTION";

interface NewButtonStateProps {
  hasDataAccess: boolean;
  hasNativeWrite: boolean;
  hasDbWithJsonEngine: boolean;
}

interface NewButtonDispatchProps {
  onChangeLocation: (nextLocation: LocationDescriptor) => void;
  closeNavbar: () => void;
}

interface NewButtonProps extends NewButtonStateProps, NewButtonDispatchProps {}

const mapStateToProps: (state: State) => NewButtonStateProps = state => ({
  hasDataAccess: getHasDataAccess(state),
  hasNativeWrite: getHasNativeWrite(state),
  hasDbWithJsonEngine: getHasDbWithJsonEngine(state),
});

const mapDispatchToProps = {
  onChangeLocation: push,
  closeNavbar,
};

function NewButton({
  hasDataAccess,
  hasNativeWrite,
  hasDbWithJsonEngine,
  onChangeLocation,
  closeNavbar,
}: NewButtonProps) {
  const [modal, setModal] = useState<NewButtonModal>(null);

  const closeModal = useCallback(() => setModal(null), []);

  const renderModalContent = useCallback(() => {
    if (modal === MODAL_NEW_COLLECTION) {
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
    if (modal === MODAL_NEW_DASHBOARD) {
      return <CreateDashboardModal onClose={closeModal} />;
    }
    return null;
  }, [modal, closeModal, onChangeLocation]);

  const menuItems = useMemo(() => {
    const items = [];

    if (hasDataAccess) {
      items.push({
        title: t`Question`,
        icon: "insight",
        link: Urls.newQuestion({
          mode: "notebook",
          creationType: "custom_question",
        }),
        event: "NavBar;New Question Click;",
        onClose: closeNavbar,
      });
    }

    if (hasNativeWrite) {
      items.push({
        title: hasDbWithJsonEngine ? t`Native query` : t`SQL query`,
        icon: "sql",
        link: Urls.newQuestion({
          type: "native",
          creationType: "native_question",
        }),
        event: "NavBar;New SQL Query Click;",
        onClose: closeNavbar,
      });
    }

    items.push(
      {
        title: t`Dashboard`,
        icon: "dashboard",
        action: () => setModal(MODAL_NEW_DASHBOARD),
        event: "NavBar;New Dashboard Click;",
      },
      {
        title: t`Collection`,
        icon: "folder",
        action: () => setModal(MODAL_NEW_COLLECTION),
        event: "NavBar;New Collection Click;",
      },
    );

    return items;
  }, [
    hasDataAccess,
    hasNativeWrite,
    hasDbWithJsonEngine,
    closeNavbar,
    setModal,
  ]);

  return (
    <>
      <Menu
        trigger={
          <StyledButton
            primary
            icon="add"
            iconSize={14}
            data-metabase-event="NavBar;Create Menu Click"
          >
            <Title>{t`New`}</Title>
          </StyledButton>
        }
        items={menuItems}
      />
      {modal && <Modal onClose={closeModal}>{renderModalContent()}</Modal>}
    </>
  );
}

export default _.compose(
  connect<NewButtonStateProps, NewButtonDispatchProps, unknown, State>(
    mapStateToProps,
    mapDispatchToProps,
  ),
)(NewButton);
