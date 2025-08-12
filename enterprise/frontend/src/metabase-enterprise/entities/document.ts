import { t } from "ttag";

import {
  canonicalCollectionId,
  isRootTrashCollection,
} from "metabase/collections/utils";
import { color } from "metabase/lib/colors";
import {
  createEntity,
  entityCompatibleQuery,
  undo,
} from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls";
import { DocumentSchema } from "metabase/schema";
import { documentApi, useGetDocumentQuery } from "metabase-enterprise/api";
import type { Document } from "metabase-types/api";

/**
 * @deprecated use "metabase/api" instead
 */
const Documents = createEntity({
  name: "documents",
  nameOne: "document",
  path: "/api/ee/document",
  schema: DocumentSchema,

  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  displayNameOne: t`document`,
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  displayNameMany: t`documents`,

  rtk: {
    getUseGetQuery: () => ({
      useGetQuery: useGetDocumentQuery,
    }),
  },

  api: {
    get: (entityQuery, options, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        documentApi.endpoints.getDocument,
      ),
    create: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        documentApi.endpoints.createDocument,
      ),
    update: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        documentApi.endpoints.updateDocument,
      ),
    delete: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        documentApi.endpoints.deleteDocument,
      ),
  },

  objectActions: {
    setArchived: ({ id }, archived, opts) =>
      Documents.actions.update(
        { id },
        { archived },
        undo(opts, t`document`, archived ? t`trashed` : t`restored`),
      ),

    setCollection: ({ id }, collection, opts) =>
      Documents.actions.update(
        { id },
        {
          collection_id: canonicalCollectionId(collection && collection.id),
          archived: isRootTrashCollection(collection),
        },
        undo(opts, "document", "moved"),
      ),

    setPinned: ({ id }, pinned, opts) =>
      Documents.actions.update(
        { id },
        {
          collection_position:
            typeof pinned === "number" ? pinned : pinned ? 1 : null,
        },
        opts,
      ),
  },

  objectSelectors: {
    getName: (document: Document) => document && document.name,
    getUrl: (document: Document) => document && Urls.document(document),
    getIcon: () => ({ name: "document" }),
    getColor: () => color("document"),
  },
});

// eslint-disable-next-line import/no-default-export
export default Documents;
