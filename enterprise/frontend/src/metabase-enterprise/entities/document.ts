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
import type {
  Collection,
  CollectionId,
  CreateDocumentRequest,
  DeleteDocumentRequest,
  Document,
  GetDocumentRequest,
  UpdateDocumentRequest,
} from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

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
    get: (
      entityQuery: GetDocumentRequest,
      _options: unknown,
      dispatch: Dispatch,
    ) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        documentApi.endpoints.getDocument,
      ),
    create: (entityQuery: CreateDocumentRequest, dispatch: Dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        documentApi.endpoints.createDocument,
      ),
    update: (entityQuery: UpdateDocumentRequest, dispatch: Dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        documentApi.endpoints.updateDocument,
      ),
    delete: (entityQuery: DeleteDocumentRequest, dispatch: Dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        documentApi.endpoints.deleteDocument,
      ),
  },

  objectActions: {
    setArchived: ({ id }: Document, archived: boolean) =>
      Documents.actions.update(
        { id },
        { archived },
        undo({}, t`document`, archived ? t`trashed` : t`restored`),
      ),

    setCollection: (
      { id }: Document,
      collection: Pick<Collection, "type" | "id">,
    ) =>
      Documents.actions.update(
        { id },
        {
          collection_id: canonicalCollectionId(collection && collection.id),
          archived: isRootTrashCollection(collection),
        },
        undo({}, t`document`, t`moved`),
      ),

    setPinned: ({ id }: Document, pinned: number | boolean) =>
      Documents.actions.update(
        { id },
        {
          collection_position:
            typeof pinned === "number" ? pinned : pinned ? 1 : null,
        },
      ),
    copy:
      (
        { id }: Document,
        overrides: { name: string; collection_id: CollectionId },
      ) =>
      async (dispatch: Dispatch) => {
        const data = (await dispatch(
          documentApi.endpoints.getDocument.initiate({ id }),
        )) as { data: Document };

        await dispatch(
          documentApi.endpoints.createDocument.initiate({
            document: data.data.document,
            ...overrides,
          }),
        );
      },
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
