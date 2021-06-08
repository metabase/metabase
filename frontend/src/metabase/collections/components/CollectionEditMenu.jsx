/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";

import EntityMenu from "metabase/components/EntityMenu";
import { ANALYTICS_CONTEXT } from "metabase/collections/constants";

export default function CollectionEditMenu({ isRoot, collection, tooltip }) {
  const items = [];
  if (!isRoot) {
    const baseUrl = Urls.collection(collection);
    items.push({
      title: t`Edit this collection`,
      icon: "edit_document",
      link: `${baseUrl}/edit`,
      event: `${ANALYTICS_CONTEXT};Edit Menu;Edit Collection Click`,
    });
    items.push({
      title: t`Archive this collection`,
      icon: "view_archive",
      link: `${baseUrl}/archive`,
      event: `${ANALYTICS_CONTEXT};Edit Menu;Archive Collection`,
    });
  }
  return items.length > 0 ? (
    <EntityMenu items={items} triggerIcon="pencil" tooltip={tooltip} />
  ) : null;
}
