import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import Link from "metabase/core/components/Link/Link";
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
