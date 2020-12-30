import React from "react";
import { t } from "ttag";

import EntityMenu from "metabase/components/EntityMenu";
import { ANALYTICS_CONTEXT } from "metabase/collections/constants";

export default function CollectionEditMenu({
  isRoot,
  isAdmin,
  collectionId,
  tooltip,
}) {
  const items = [];
  if (!isRoot) {
    items.push({
      title: t`Edit this collection`,
      icon: "edit_document",
      link: `/collection/${collectionId}/edit`,
      event: `${ANALYTICS_CONTEXT};Edit Menu;Edit Collection Click`,
    });
  }
  if (!isRoot) {
    items.push({
      title: t`Archive this collection`,
      icon: "view_archive",
      link: `/collection/${collectionId}/archive`,
      event: `${ANALYTICS_CONTEXT};Edit Menu;Archive Collection`,
    });
  }
  return items.length > 0 ? (
    <EntityMenu items={items} triggerIcon="pencil" tooltip={tooltip} />
  ) : null;
}
