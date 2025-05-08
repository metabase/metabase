import type { LocationDescriptor } from "history";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { t } from "ttag";

import EntityMenu from "metabase/components/EntityMenu";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { setOpenModal } from "metabase/redux/ui";
import { getSetting } from "metabase/selectors/settings";
import type { CollectionId } from "metabase-types/api";

import { trackNewMenuItemClicked } from "./analytics";

type NewMenuItem = {
  title: string;
  icon: string;
  link?: LocationDescriptor;
  event?: string;
  action?: () => void;
  onClose?: () => void;
};

export interface NewItemMenuProps {
  className?: string;
  collectionId?: CollectionId;
  trigger?: ReactNode;
  triggerIcon?: string;
  triggerTooltip?: string;
  hasDataAccess: boolean;
  hasNativeWrite: boolean;
  hasDatabaseWithJsonEngine: boolean;
  onCloseNavbar: () => void;
  onChangeLocation: (nextLocation: LocationDescriptor) => void;
}

const NewItemMenu = ({
  className,
  collectionId,
  trigger,
  triggerIcon,
  triggerTooltip,
  hasDataAccess,
  hasNativeWrite,
  hasDatabaseWithJsonEngine,
  onCloseNavbar,
}: NewItemMenuProps) => {
  const dispatch = useDispatch();

  const lastUsedDatabaseId = useSelector((state) =>
    getSetting(state, "last-used-native-database-id"),
  );

  const menuItems = useMemo(() => {
    const items: NewMenuItem[] = [];

    if (hasDataAccess) {
      // TODO: Add anon tracking once we enable onClick
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
      // TODO: Add anon tracking once we enable onClick
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

    items.push({
      title: t`Dashboard`,
      icon: "dashboard",
      action: () => {
        trackNewMenuItemClicked("dashboard");
        dispatch(setOpenModal("dashboard"));
      },
    });

    return items;
  }, [
    hasDataAccess,
    hasNativeWrite,
    collectionId,
    onCloseNavbar,
    hasDatabaseWithJsonEngine,
    lastUsedDatabaseId,
    dispatch,
  ]);

  return (
    <EntityMenu
      className={className}
      // To the best of my knowledge, entity menu items with a `link` prop
      // do not have `onClick`handlers. Hence, we cannot track their clicks.
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
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NewItemMenu;
