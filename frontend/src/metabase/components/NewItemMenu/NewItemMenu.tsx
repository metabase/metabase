import type { ReactNode } from "react";
import { useMemo } from "react";
import { t } from "ttag";
import type { LocationDescriptor } from "history";

import EntityMenu from "metabase/components/EntityMenu";

import * as Urls from "metabase/lib/urls";

import type { CollectionId } from "metabase-types/api";
import { useDispatch } from "metabase/lib/redux";
import { setOpenModal } from "metabase/redux/ui";

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
}: // onChangeLocation,
NewItemMenuProps) => {
  const dispatch = useDispatch();

  // const handleModalClose = useCallback(() => {
  //   setModal(undefined);
  // }, []);

  // const handleActionCreated = useCallback(
  //   (action: WritebackAction) => {
  //     const nextLocation = Urls.modelDetail({ id: action.model_id }, "actions");
  //     onChangeLocation(nextLocation);
  //   },
  //   [onChangeLocation],
  // );

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
        }),
        onClose: onCloseNavbar,
      });
    }

    items.push(
      {
        title: t`Dashboard`,
        icon: "dashboard",
        action: () => dispatch(setOpenModal("dashboard")),
      },
      {
        title: t`Collection`,
        icon: "folder",
        action: () => dispatch(setOpenModal("collection")),
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
        action: () => dispatch(setOpenModal("action")),
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
    dispatch,
  ]);

  return (
    <EntityMenu
      className={className}
      items={menuItems}
      trigger={trigger}
      triggerIcon={triggerIcon}
      tooltip={triggerTooltip}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NewItemMenu;
