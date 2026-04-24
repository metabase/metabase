import cx from "classnames";

import { Link } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import { useCollectionPath } from "metabase/data-studio/common/hooks/use-collection-path/useCollectionPath";
import { Breadcrumbs, Icon } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Card } from "metabase-types/api";

interface CollectionBreadcrumbsProps {
  card: Card;
}

export function CollectionBreadcrumbs({ card }: CollectionBreadcrumbsProps) {
  const { path, isLoadingPath } = useCollectionPath({
    collectionId: card.collection_id,
  });

  return (
    <Breadcrumbs
      separator={<Icon size={12} name="chevronright" />}
      fz="sm"
      c="text-secondary"
      className={cx({ [CS.hidden]: isLoadingPath })}
    >
      {path?.map((collection) => (
        <Link
          key={collection.id}
          to={Urls.collection({ id: collection.id, name: "" })}
        >
          {collection.name}
        </Link>
      ))}
    </Breadcrumbs>
  );
}
