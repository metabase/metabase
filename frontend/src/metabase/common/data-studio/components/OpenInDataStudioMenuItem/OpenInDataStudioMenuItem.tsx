import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { canAccessDataStudio } from "metabase/common/data-studio/selectors";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { Icon, Menu } from "metabase/ui";
import type { CollectionType } from "metabase-types/api";

type OpenInDataStudioMenuItemProps = {
  collectionType: CollectionType | null | undefined;
  to: string;
};

/**
 * An "Open in Data Studio" menu item followed by a divider, rendered only for
 * an item in the Library when the user can access Data Studio.
 */
export function OpenInDataStudioMenuItem({
  collectionType,
  to,
}: OpenInDataStudioMenuItemProps) {
  const hasDataStudioAccess = useSelector(canAccessDataStudio);

  if (
    !hasDataStudioAccess ||
    !PLUGIN_LIBRARY.isLibraryCollectionType(collectionType)
  ) {
    return null;
  }

  return (
    <>
      <Menu.Item
        leftSection={<Icon name="grid_bordered" />}
        component={ForwardRefLink}
        to={to}
      >{t`Open in Data Studio`}</Menu.Item>
      <Menu.Divider />
    </>
  );
}
