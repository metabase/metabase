import {
  snippetApi,
  useGetSnippetQuery,
  useListSnippetsQuery,
} from "metabase/api";
import { createEntity, entityCompatibleQuery } from "metabase/lib/entities";

/**
 * @deprecated use "metabase/api" instead
 */
const Snippets = createEntity({
  name: "snippets",
  nameOne: "snippet",
  path: "/api/native-query-snippet",
  createSelectors: ({ getObject, getFetched }) => ({
    getFetched: (state, props) =>
      getFetched(state, props) || getObject(state, props),
  }),

  rtk: {
    getUseGetQuery: () => ({
      useGetQuery,
    }),
    useListQuery: useListSnippetsQuery,
  },

  api: {
    list: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        snippetApi.endpoints.listSnippets,
      ),
    get: (entityQuery, options, dispatch) =>
      entityCompatibleQuery(
        entityQuery.id,
        dispatch,
        snippetApi.endpoints.getSnippet,
      ),
    create: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        snippetApi.endpoints.createSnippet,
      ),
    update: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        snippetApi.endpoints.updateSnippet,
      ),
    delete: () => {
      throw new TypeError("Snippets.api.delete is not supported");
    },
  },
});

const useGetQuery = ({ id }) => {
  return useGetSnippetQuery(id);
};

export default Snippets;
