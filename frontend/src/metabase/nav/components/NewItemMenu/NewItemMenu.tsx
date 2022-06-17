import React, { ReactElement, useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import { LocationDescriptor } from "history";
import * as Urls from "metabase/lib/urls";
import Modal from "metabase/components/Modal";
import EntityMenu from "metabase/components/EntityMenu";
import CreateDashboardModal from "metabase/components/CreateDashboardModal";
import CollectionCreate from "metabase/collections/containers/CollectionCreate";
import { Collection } from "metabase-types/api";

type ModalType = "new-dashboard" | "new-collection";

export interface NewItemMenuProps {
  trigger: ReactElement;
  hasDataAccess: boolean;
  hasNativeWrite: boolean;
  hasDbWithJsonEngine: boolean;
  onChangeLocation: (location: LocationDescriptor) => void;
  onCloseNavbar: () => void;
}

const NewItemMenu = ({
  trigger,
  hasDataAccess,
  hasNativeWrite,
  hasDbWithJsonEngine,
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
        event: "NavBar;New Question Click;",
        onClose: onCloseNavbar,
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
        onClose: onCloseNavbar,
      });
    }

    items.push(
      {
        title: t`Dashboard`,
        icon: "dashboard",
        action: () => setModal("new-dashboard"),
        event: "NavBar;New Dashboard Click;",
      },
      {
        title: t`Collection`,
        icon: "folder",
        action: () => setModal("new-collection"),
        event: "NavBar;New Collection Click;",
      },
    );

    return items;
  }, [hasDataAccess, hasNativeWrite, hasDbWithJsonEngine, onCloseNavbar]);

  return (
    <>
      <EntityMenu trigger={trigger} items={menuItems} />
      {modal && (
        <Modal onClose={handleModalClose}>
          {modal === "new-collection" && (
            <CollectionCreate
              onClose={handleModalClose}
              onSaved={handleCollectionSave}
            />
          )}
          {modal === "new-dashboard" && (
            <CreateDashboardModal onClose={handleModalClose} />
          )}
        </Modal>
      )}
    </>
  );
};

export default NewItemMenu;
