import type { LocationDescriptor } from "history";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import ActionCreator from "metabase/actions/containers/ActionCreator";
import CreateCollectionModal from "metabase/collections/containers/CreateCollectionModal";
import EntityMenu from "metabase/components/EntityMenu";
import Modal from "metabase/components/Modal";
import { CreateDashboardModalConnected } from "metabase/dashboard/containers/CreateDashboardModal";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getSetting } from "metabase/selectors/settings";
import type { CollectionId, WritebackAction } from "metabase-types/api";

type ModalType = "new-action" | "new-dashboard" | "new-collection";

export interface NewItemMenuProps {
  className?: string;
  collectionId?: CollectionId;
  trigger?: ReactNode;
  triggerIcon?: string;
  triggerTooltip?: string;
  hasModels: boolean;
  hasDataAccess: boolean;
  hasNativeWrite: boolean;
  hasDatabaseWithJsonEngine: boolean;
  hasDatabaseWithActionsEnabled: boolean;
  onCloseNavbar: () => void;
  onChangeLocation: (nextLocation: LocationDescriptor) => void;
}

type NewMenuItem = {
  title: string;
  icon: string;
  link?: LocationDescriptor;
  event?: string;
  action?: () => void;
  onClose?: () => void;
};

const NewItemMenu = ({
  className,
  collectionId,
  trigger,
  triggerIcon,
  triggerTooltip,
  hasModels,
  hasDataAccess,
  hasNativeWrite,
  hasDatabaseWithJsonEngine,
  hasDatabaseWithActionsEnabled,
  onCloseNavbar,
  onChangeLocation,
}: NewItemMenuProps) => {
  const [modal, setModal] = useState<ModalType>();

  const lastUsedDatabaseId = useSelector(state =>
    getSetting(state, "last-used-native-database-id"),
  );

  const handleModalClose = useCallback(() => {
    setModal(undefined);
  }, []);

  const handleActionCreated = useCallback(
    (action: WritebackAction) => {
      const nextLocation = Urls.modelDetail({ id: action.model_id }, "actions");
      onChangeLocation(nextLocation);
    },
    [onChangeLocation],
  );

  const menuItems = useMemo(() => {
    const items: NewMenuItem[] = [];

    if (hasDataAccess) {
      items.push({
        title: t`Question`,
        icon: "insight",
        link: Urls.newQuestion({
          mode: "notebook",
          creationType: "custom_question",
          collectionId,
          cardType: "question",
        }),
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
          cardType: "question",
          databaseId: lastUsedDatabaseId || undefined,
        }),
        onClose: onCloseNavbar,
      });
    }

    items.push(
      {
        title: t`Dashboard`,
        icon: "dashboard",
        action: () => setModal("new-dashboard"),
      },
      {
        title: t`Collection`,
        icon: "folder",
        action: () => setModal("new-collection"),
      },
    );
    if (hasNativeWrite) {
      const collectionQuery = collectionId
        ? `?collectionId=${collectionId}`
        : "";

      items.push({
        title: t`Model`,
        icon: "model",
        link: `/model/new${collectionQuery}`,
        onClose: onCloseNavbar,
      });
    }

    if (hasModels && hasDatabaseWithActionsEnabled && hasNativeWrite) {
      items.push({
        title: t`Action`,
        icon: "bolt",
        action: () => setModal("new-action"),
      });
    }

    return items;
  }, [
    hasDataAccess,
    hasNativeWrite,
    hasModels,
    hasDatabaseWithActionsEnabled,
    collectionId,
    onCloseNavbar,
    hasDatabaseWithJsonEngine,
    lastUsedDatabaseId,
  ]);

  return (
    <>
      <EntityMenu
        className={className}
        items={menuItems}
        trigger={trigger}
        triggerIcon={triggerIcon}
        tooltip={triggerTooltip}
        // I've disabled this transition, since it results in the menu
        // sometimes not appearing until content finishes loading on complex
        // dashboards and questions #39303
        // TODO: Try to restore this transition once we upgrade to React 18 and can prioritize this update
        transitionDuration={0}
      />
      {modal && (
        <>
          {modal === "new-collection" ? (
            <Modal onClose={handleModalClose}>
              <CreateCollectionModal
                collectionId={collectionId}
                onClose={handleModalClose}
              />
            </Modal>
          ) : modal === "new-dashboard" ? (
            <Modal onClose={handleModalClose}>
              <CreateDashboardModalConnected
                collectionId={collectionId}
                onClose={handleModalClose}
              />
            </Modal>
          ) : modal === "new-action" ? (
            <Modal
              wide
              enableTransition={false}
              onClose={handleModalClose}
              closeOnClickOutside
            >
              <ActionCreator
                onSubmit={handleActionCreated}
                onClose={handleModalClose}
              />
            </Modal>
          ) : null}
        </>
      )}
    </>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NewItemMenu;
