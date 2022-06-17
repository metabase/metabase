import React, { ReactNode, useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import Modal from "metabase/components/Modal";
import EntityMenu from "metabase/components/EntityMenu";
import CreateDashboardModal from "metabase/components/CreateDashboardModal";
import CollectionCreate from "metabase/collections/containers/CollectionCreate";
import { Collection } from "metabase-types/api";

type ModalType = "new-dashboard" | "new-collection";

export interface NewItemMenuProps {
  className?: string;
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
              onClose={handleModalClose}
              onSaved={handleCollectionSave}
            />
          ) : modal === "new-dashboard" ? (
            <CreateDashboardModal onClose={handleModalClose} />
          ) : null}
        </Modal>
      )}
    </>
  );
};

export default NewItemMenu;
