import { t } from "ttag";

import { isRootCollection } from "metabase/common/collections/utils";
import type { RemoteSyncChangesArea } from "metabase/plugins";
import * as Urls from "metabase/urls";
import type {
  Collection,
  CollectionEssentials,
  IconName,
  RemoteSyncDirtyItem,
  RemoteSyncItem,
  RemoteSyncItemModel,
  Table,
  TransformId,
} from "metabase-types/api";

type RemoteSyncItemOrDirtyItem = RemoteSyncItem | RemoteSyncDirtyItem;

type RemoteSyncItemCollection = Pick<
  Collection,
  "id" | "name" | "type" | "effective_ancestors"
>;

export type RemoteSyncItemTable = Pick<Table, "id" | "name" | "display_name"> &
  Partial<Pick<Table, "collection">>;

export type RemoteSyncItemSection = {
  key: string;
  icon: IconName;
  name: string;
};

const MODEL_ICONS: Record<RemoteSyncItemModel, IconName> = {
  action: "bolt",
  card: "table2",
  cardtest: "list",
  collection: "folder",
  dashboard: "dashboard",
  dataapp: "app",
  dimension: "field",
  document: "document",
  fieldusersettings: "field",
  glossary: "glossary",
  measure: "sum",
  nativequerysnippet: "snippet",
  pythonlibrary: "code_block",
  segment: "segment",
  tableusersettings: "table",
  timeline: "calendar",
  transform: "insight",
  transformtag: "label",
  transformtest: "list",
};

export function getModelIcon(model: RemoteSyncItemModel): IconName {
  return MODEL_ICONS[model];
}

function getCollectionPath(
  collection: RemoteSyncItemCollection | null | undefined,
): CollectionEssentials[] {
  return collection != null
    ? [...(collection.effective_ancestors ?? []), collection].filter(
        (pathCollection) => !isRootCollection(pathCollection),
      )
    : [];
}

export function getItemCollections(
  item: RemoteSyncItemOrDirtyItem,
): CollectionEssentials[] {
  switch (item.model) {
    case "collection":
      return getCollectionPath(item.data);
    case "card":
    case "dashboard":
    case "document":
    case "nativequerysnippet":
    case "tableusersettings":
    case "timeline":
    case "transform":
      return getCollectionPath(item.data?.collection);
    case "cardtest":
      return getCollectionPath(item.data?.card?.collection);
    case "transformtest":
      return getCollectionPath(item.data?.transform?.collection);
    case "segment":
    case "measure":
      return getCollectionPath(item.data?.table?.collection);
    case "fieldusersettings":
    case "dimension":
      return getCollectionPath(item.data?.field?.table?.collection);
    case "action":
      return getCollectionPath(
        item.data?.model?.collection ?? item.data?.collection,
      );
    case "dataapp":
    case "glossary":
    case "pythonlibrary":
    case "transformtag":
      return [];
  }
}

export function getItemTable(
  item: RemoteSyncItemOrDirtyItem,
): RemoteSyncItemTable | null {
  switch (item.model) {
    case "tableusersettings":
      return item.data?.table != null
        ? {
            ...item.data.table,
            display_name:
              item.data.display_name ?? item.data.table.display_name,
          }
        : null;
    case "segment":
    case "measure":
      return item.data?.table ?? null;
    case "fieldusersettings":
    case "dimension":
      return item.data?.field?.table ?? null;
    default:
      return null;
  }
}

export function isItemCollection(
  item: RemoteSyncItemOrDirtyItem,
  collection: CollectionEssentials,
): boolean {
  return item.model === "collection" && item.id === collection.id;
}

export function isItemTable(
  item: RemoteSyncItemOrDirtyItem,
  table: RemoteSyncItemTable,
): boolean {
  return item.model === "tableusersettings" && item.id === table.id;
}

const DATA_SECTION = { key: "data", icon: "database" } as const;
const TRANSFORMS_SECTION = { key: "transforms", icon: "insight" } as const;

export function getItemSection(
  item: RemoteSyncItemOrDirtyItem,
): RemoteSyncItemSection {
  switch (item.model) {
    case "tableusersettings":
    case "fieldusersettings":
    case "dimension":
    case "segment":
    case "measure":
      return { ...DATA_SECTION, name: t`Data` };
    case "transform":
    case "transformtag":
    case "transformtest":
    case "pythonlibrary":
      return { ...TRANSFORMS_SECTION, name: t`Transforms` };
    case "nativequerysnippet":
      return { key: "snippets", icon: "snippet", name: t`Snippets` };
    case "glossary":
      return { key: "glossary", icon: "glossary", name: t`Glossary` };
    case "action":
      return { key: "actions", icon: "bolt", name: t`Actions` };
    case "dataapp":
      return { key: "data-apps", icon: "app", name: t`Data apps` };
    case "card":
    case "cardtest":
    case "collection":
    case "dashboard":
    case "document":
    case "timeline":
      return { key: "other", icon: "folder", name: t`Other content` };
  }
}

function getItemModelAreas(
  item: RemoteSyncItemOrDirtyItem,
): RemoteSyncChangesArea[] {
  switch (item.model) {
    case "tableusersettings":
    case "fieldusersettings":
    case "dimension":
    case "segment":
    case "measure":
      return ["library"];
    case "transform":
    case "transformtag":
    case "transformtest":
      return ["transforms"];
    case "pythonlibrary":
      return ["transforms", "python-library"];
    case "nativequerysnippet":
      return ["snippets"];
    case "glossary":
      return ["glossary"];
    case "action":
      return item.data?.model_id == null ? ["data-actions"] : [];
    case "card":
    case "cardtest":
    case "collection":
    case "dashboard":
    case "dataapp":
    case "document":
    case "timeline":
      return [];
  }
}

export function getItemAreas(
  item: RemoteSyncItemOrDirtyItem,
): RemoteSyncChangesArea[] {
  const isInLibrary = getItemCollections(item).some(
    ({ type }) => type === "library",
  );
  return [
    ...new Set<RemoteSyncChangesArea>([
      ...(isInLibrary ? ["library" as const] : []),
      ...getItemModelAreas(item),
    ]),
  ];
}

export function getItemTransformId(
  item: RemoteSyncItemOrDirtyItem,
): TransformId | null {
  return item.model === "transform" ? item.id : null;
}

export function getItemName(item: RemoteSyncItem): string {
  switch (item.model) {
    case "glossary":
      return item.data.term;
    case "pythonlibrary":
      return item.data.path;
    case "dataapp":
      return item.data.name ?? item.data.slug;
    case "tableusersettings":
      return (
        item.data.display_name ??
        item.data.table?.display_name ??
        item.data.table?.name ??
        ""
      );
    case "fieldusersettings":
      return (
        item.data.display_name ??
        item.data.field?.display_name ??
        item.data.field?.name ??
        ""
      );
    default:
      return item.data.name;
  }
}

export function getItemUrl(item: RemoteSyncItemOrDirtyItem): string | null {
  switch (item.model) {
    case "tableusersettings":
      return Urls.dataStudioTable(item.id);
    case "fieldusersettings":
      return item.data?.field
        ? Urls.dataStudioTableFields(item.data.field.table_id, item.id)
        : null;
    case "dimension":
      return item.data?.field
        ? Urls.dataStudioTableFields(
            item.data.field.table_id,
            item.data.field_id,
          )
        : null;
    case "segment":
      return item.data
        ? Urls.dataStudioPublishedTableSegment(item.data.table_id, item.id)
        : null;
    case "measure":
      return item.data
        ? Urls.dataStudioPublishedTableMeasure(item.data.table_id, item.id)
        : null;
    case "transformtest":
      return item.data
        ? Urls.transformTest(item.data.transform_id, item.id)
        : null;
    case "cardtest":
      return null;
    case "action":
      return item.data?.model_id != null
        ? Urls.action({ id: item.data.model_id }, item.id)
        : Urls.dataStudioAction(item.id);
    case "dataapp":
      return item.data ? Urls.dataStudioDataApp(item.data.slug) : null;
    case "nativequerysnippet":
      return Urls.dataStudioSnippet(item.id);
    case "glossary":
      return Urls.dataStudioGlossary();
    case "pythonlibrary":
      return item.data
        ? Urls.transformPythonLibrary({ path: item.data.path })
        : null;
    case "transformtag":
      return Urls.transformList();
    case "collection":
      return item.data
        ? Urls.modelToUrl({
            id: item.id,
            model: item.model,
            name: item.data.name,
          })
        : null;
    case "card":
    case "dashboard":
    case "document":
    case "timeline":
    case "transform":
      return item.data
        ? Urls.modelToUrl({
            id: item.id,
            model: item.model,
            name: item.data.name,
            collection_id: item.data.collection_id ?? null,
          })
        : null;
  }
}
