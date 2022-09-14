import React, { ReactNode, useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import Modal from "metabase/components/Modal";
import EntityMenu from "metabase/components/EntityMenu";
import CreateDashboardModal from "metabase/components/CreateDashboardModal";

import * as Urls from "metabase/lib/urls";

import CollectionCreate from "metabase/collections/containers/CollectionCreate";
import CreateDataAppModal from "metabase/writeback/containers/CreateDataAppModal";

import type { Collection, CollectionId } from "metabase-types/api";

import { WideModal } from "./NewItemMenu.styled";

type ModalType = "new-app" | "new-dashboard" | "new-collection";

export interface NewItemMenuProps {
  className?: string;
  collectionId?: CollectionId;
  trigger?: ReactNode;
  triggerIcon?: string;
  triggerTooltip?: string;
  analyticsContext?: string;
  hasDataAccess: boolean;
  hasNativeWrite: boolean;
  hasDatabaseWithJsonEngine: boolean;
  onChangeLocation: (location: string) => void;
  onCloseNavbar: () => void;
}

const NewItemMenu = ({
  className,
  collectionId,
  trigger,
  triggerIcon,
  triggerTooltip,
  analyticsContext,
  hasDataAccess,
  hasNativeWrite,
  hasDatabaseWithJsonEngine,
  onChangeLocation,
  onCloseNavbar,
}: NewItemMenuProps) => {
  const [modal, setModal] = useState<ModalType>();

  const handleModalClose = useCallback(() => {
    setModal(undefined);
  }, []);

  const handleCollectionSave = useCallback(
    (collection: Collection) => {
      handleModalClose();
      onChangeLocation(Urls.collection(collection));
    },
    [handleModalClose, onChangeLocation],
  );

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
        event: `${analyticsContext};New Question Click;`,
        onClose: onCloseNavbar,
      });
    }

    if (hasNativeWrite) {
      items.push({
        title: hasDatabaseWithJsonEngine ? t`Native query` : t`SQL query`,
        icon: "sql",
        link: Urls.newQuestion({
          type: "native",
          creationType: "native_question",
        }),
        event: `${analyticsContext};New SQL Query Click;`,
        onClose: onCloseNavbar,
      });

      // we should probably get more granular with who sees this
      items.push({
        title: t`Action`,
        icon: "play",
        link: "/action/create",
        event: `${analyticsContext};New Action Click;`,
        onClose: onCloseNavbar,
      });
    }

    items.push(
      {
        title: t`Dashboard`,
        icon: "dashboard",
        action: () => setModal("new-dashboard"),
        event: `${analyticsContext};New Dashboard Click;`,
      },
      {
        title: t`Collection`,
        icon: "folder",
        action: () => setModal("new-collection"),
        event: `${analyticsContext};New Collection Click;`,
      },
      {
        title: t`App`,
        icon: "star",
        action: () => setModal("new-app"),
        event: `${analyticsContext};New App Click;`,
      },
    );

    return items;
  }, [
    hasDataAccess,
    hasNativeWrite,
    hasDatabaseWithJsonEngine,
    analyticsContext,
    onCloseNavbar,
  ]);

  return (
    <>
      <EntityMenu
        className={className}
        items={menuItems}
        trigger={trigger}
        triggerIcon={triggerIcon}
        tooltip={triggerTooltip}
      />
      {modal && (
        <>
          {modal === "new-collection" ? (
            <Modal onClose={handleModalClose}>
              <CollectionCreate
                collectionId={collectionId}
                onClose={handleModalClose}
                onSaved={handleCollectionSave}
              />
            </Modal>
          ) : modal === "new-dashboard" ? (
            <Modal onClose={handleModalClose}>
              <CreateDashboardModal
                collectionId={collectionId}
                onClose={handleModalClose}
              />
            </Modal>
          ) : modal === "new-app" ? (
            <WideModal onClose={handleModalClose}>
              <CreateDataAppModal onClose={handleModalClose} />
            </WideModal>
          ) : null}
        </>
      )}
    </>
  );
};

export default NewItemMenu;
