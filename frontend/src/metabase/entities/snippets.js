import { createEntity } from "metabase/lib/entities";

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
