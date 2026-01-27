import { push } from "react-router-redux";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link/Link";
import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import type { Collection } from "metabase-types/api";

interface CollectionPermissionsProps {
  collection: Collection;
}

export const CollectionPermissions = ({
  collection,
}: CollectionPermissionsProps) => {
  const dispatch = useDispatch();
  const url = `${Urls.collection(collection)}/permissions`;

  return (
    <Link to={url}>
      <ToolbarButton
        icon="lock"
        aria-label={t`Edit permissions`}
        tooltipLabel={t`Edit permissions`}
        tooltipPosition="bottom"
        onClick={() => {
          // ToolbarButton has "e.preventDefault", so we have to navigate manually
          dispatch(push(url));
        }}
      />
    </Link>
  );
};
