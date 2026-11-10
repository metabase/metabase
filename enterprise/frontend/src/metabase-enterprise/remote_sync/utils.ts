import * as Urls from "metabase/urls";
import type {
  IconName,
  RemoteSyncEntityCollection,
  RemoteSyncEntityId,
  RemoteSyncEntityModel,
  RemoteSyncEntityParent,
} from "metabase-types/api";

export type RemoteSyncEntityLinkTarget = {
  id: RemoteSyncEntityId;
  name: string;
  model: RemoteSyncEntityModel;
  collection?: RemoteSyncEntityCollection;
  parent?: RemoteSyncEntityParent;
};

const MODEL_ICONS: Record<RemoteSyncEntityModel, IconName> = {
  action: "bolt",
  card: "table2",
  collection: "folder",
  dashboard: "dashboard",
  dataapp: "app",
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

export const getModelIcon = (model: RemoteSyncEntityModel): IconName =>
  MODEL_ICONS[model];

export const getEntityUrl = ({
  id,
  name,
  model,
  collection,
  parent,
}: RemoteSyncEntityLinkTarget): string | null => {
  switch (model) {
    case "tableusersettings":
      return Urls.dataStudioTable(id);
    case "fieldusersettings":
      return parent?.model === "tableusersettings"
        ? Urls.dataStudioTableFields(parent.id, id)
        : null;
    case "segment":
      return parent?.model === "tableusersettings"
        ? Urls.dataStudioPublishedTableSegment(parent.id, id)
        : null;
    case "measure":
      return parent?.model === "tableusersettings"
        ? Urls.dataStudioPublishedTableMeasure(parent.id, id)
        : null;
    case "transformtest":
      return parent?.model === "transform"
        ? Urls.transformTest(parent.id, id)
        : null;
    case "action":
      return parent?.model === "card"
        ? Urls.action({ id: parent.id }, id)
        : Urls.dataStudioAction(id);
    case "dataapp":
      return Urls.dataStudioDataApp(name);
    case "nativequerysnippet":
      return Urls.dataStudioSnippet(id);
    case "glossary":
      return Urls.dataStudioGlossary();
    case "pythonlibrary":
      return Urls.transformPythonLibrary({ path: name });
    case "transformtag":
      return Urls.transformList();
    case "card":
    case "collection":
    case "dashboard":
    case "document":
    case "timeline":
    case "transform":
      return Urls.modelToUrl({
        id,
        model,
        name,
        collection_id: collection?.id ?? null,
      });
  }
};
