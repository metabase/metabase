import cx from "classnames";

import { Link } from "metabase/common/components/Link";
import { getPickerCollectionName } from "metabase/common/components/Pickers/utils";
import { useCollectionPath } from "metabase/common/data-studio/hooks/use-collection-path/useCollectionPath";
import CS from "metabase/css/core/index.css";
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
          {/* PROTOTYPE: the Library's sections use the nav's names, so the
              Library reads "Data", not "Library". */}
          {getPickerCollectionName(collection)}
        </Link>
      ))}
    </Breadcrumbs>
  );
}
