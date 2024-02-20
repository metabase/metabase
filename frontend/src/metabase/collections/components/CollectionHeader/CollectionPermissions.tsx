import { t } from "ttag";

import Link from "metabase/core/components/Link/Link";
import Tooltip from "metabase/core/components/Tooltip";
import * as Urls from "metabase/lib/urls";
import type { Collection } from "metabase-types/api";

import { CollectionHeaderButton } from "./CollectionHeader.styled";

interface CollectionPermissionsProps {
  collection: Collection;
}

export const CollectionPermissions = ({
  collection,
}: CollectionPermissionsProps) => {
  const url = `${Urls.collection(collection)}/permissions`;

  return (
    <Tooltip tooltip={t`Edit permissions`} placement="bottom">
      <div>
        <CollectionHeaderButton as={Link} to={url} icon="lock" />
      </div>
    </Tooltip>
  );
};
