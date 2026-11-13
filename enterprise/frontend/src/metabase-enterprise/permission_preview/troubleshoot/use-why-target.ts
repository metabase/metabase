import { t } from "ttag";

import { skipToken, useGetCardQuery, useGetDashboardQuery } from "metabase/api";
import type { CollectionId } from "metabase-types/api";

import {
  type AffectingAttribute,
  type PreviewCollectionsResponse,
  type PreviewDataResponse,
  type Principal,
  useGetCollectionsPreviewQuery,
  useGetDataPreviewQuery,
} from "../api";
import { getWhoName } from "../preview/PrincipalHeader";
import type { WhyTarget } from "../preview/WhySidesheet";

import type { OpenedItem } from "./item-path";

/**
 * What "Why?" explains for the item open in the frame: the access to its collection when that
 * denies it, else the row security on the first table a rule reads an attribute for.
 */
export function useWhyTarget(
  principal: Principal | null,
  item: OpenedItem | null,
  attributes: AffectingAttribute[],
): WhyTarget | null {
  const { data: dashboard } = useGetDashboardQuery(
    item?.type === "dashboard" ? { id: item.id } : skipToken,
  );
  const { data: card } = useGetCardQuery(
    item?.type === "card" ? { id: item.id } : skipToken,
  );
  const { data: collections } = useGetCollectionsPreviewQuery(
    principal != null && item != null
      ? { principal, namespace: "default" }
      : skipToken,
  );
  const securedTableId = attributes
    .filter((attribute) => attribute.applies)
    .flatMap((attribute) => attribute.uses)
    .find((use) => use.kind === "sandbox" && use.table_id != null)?.table_id;
  const { data: dataPreview } = useGetDataPreviewQuery(
    principal != null && securedTableId != null ? principal : skipToken,
  );

  if (item == null || collections == null) {
    return null;
  }
  const collectionId = getCollectionId(item, dashboard, card);
  if (collectionId === undefined) {
    return null;
  }
  const collectionTarget = getCollectionTarget(collections, collectionId);
  const isDenied = collectionTarget?.cell.value === "none";
  if (!isDenied && dataPreview != null && securedTableId != null) {
    return getTableTarget(dataPreview, securedTableId) ?? collectionTarget;
  }
  return collectionTarget;
}

/** The item's collection: `null` for the root, `undefined` while it loads. */
function getCollectionId(
  item: OpenedItem,
  dashboard: { collection_id: CollectionId | null } | undefined,
  card: { collection_id: CollectionId | null } | undefined,
): CollectionId | null | undefined {
  switch (item.type) {
    case "collection":
      return item.id;
    case "dashboard":
      return dashboard?.collection_id;
    case "card":
      return card?.collection_id;
  }
}

function getCollectionTarget(
  data: PreviewCollectionsResponse,
  collectionId: CollectionId | null,
): WhyTarget | null {
  if (!data.applies) {
    return {
      title: t`Collection access`,
      who: getWhoName(data.principal),
      subject: { label: t`Collection`, value: t`Main collections` },
      column: "collection",
      cell: { value: "none", group_id: null, groups: [], note: data.reason },
      security: null,
    };
  }
  const collection = data.collections.find(
    ({ id }) => id === (collectionId ?? "root"),
  );
  if (collection == null) {
    return null;
  }
  return {
    title: collection.name,
    who: getWhoName(data.principal),
    subject: { label: t`Collection`, value: collection.name },
    column: "collection",
    cell: collection.access,
    security: null,
  };
}

function getTableTarget(
  data: PreviewDataResponse,
  tableId: number,
): WhyTarget | null {
  for (const database of data.databases) {
    const table = database.tables.find(({ id }) => id === tableId);
    if (table != null) {
      const tableName = table.display_name ?? table.name;
      return {
        title: tableName,
        who: getWhoName(data.principal),
        subject: { label: t`Table`, value: `${database.name} / ${tableName}` },
        column: "view_data",
        cell: table.view_data,
        security: table.security,
      };
    }
  }
  return null;
}
