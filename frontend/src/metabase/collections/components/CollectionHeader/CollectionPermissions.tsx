import { t } from "ttag";

import Link from "metabase/common/components/Link/Link";
import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import * as Urls from "metabase/lib/urls";
import type { Collection } from "metabase-types/api";

interface CollectionPermissionsProps {
  collection: Collection;
}

export const CollectionPermissions = ({
  collection,
}: CollectionPermissionsProps) => {
  const url = `${Urls.collection(collection)}/permissions`;

  return (
    <Link to={url}>
      <ToolbarButton
        icon="lock"
        aria-label={t`Edit permissions`}
        tooltipLabel={t`Edit permissions`}
      />
    </Link>
  );
};
