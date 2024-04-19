import { createEntity } from "metabase/lib/entities";

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

  api: {
    delete: () => {
      throw new TypeError("Snippets.api.delete is not supported");
    },
  },
});

export default Snippets;
