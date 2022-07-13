import React, { ReactNode, useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import Modal from "metabase/components/Modal";
import EntityMenu from "metabase/components/EntityMenu";
import CreateDashboardModal from "metabase/components/CreateDashboardModal";
import CollectionCreate from "metabase/collections/containers/CollectionCreate";
import { Collection, CollectionId } from "metabase-types/api";

type ModalType = "new-dashboard" | "new-collection";

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
          collectionId,
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
          collectionId,
        }),
        event: `${analyticsContext};New SQL Query Click;`,
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
    );

    return items;
  }, [
    collectionId,
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
        <Modal onClose={handleModalClose}>
          {modal === "new-collection" ? (
            <CollectionCreate
              collectionId={collectionId}
              onClose={handleModalClose}
              onSaved={handleCollectionSave}
            />
          ) : modal === "new-dashboard" ? (
            <CreateDashboardModal
              collectionId={collectionId}
              onClose={handleModalClose}
            />
          ) : null}
        </Modal>
      )}
    </>
  );
};

export default NewItemMenu;
