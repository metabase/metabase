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
});

export default Snippets;
