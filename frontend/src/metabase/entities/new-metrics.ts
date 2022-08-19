import { createEntity } from "metabase/lib/entities";

const NewMetrics = createEntity({
  name: "newMetrics",
  nameOne: "newMetric",
  nameMany: "newMetrics",
  path: "/api/newmetric",

  selectors: {
    getObject: (state: any, { entityId }: { entityId: number }) => {
      return state.entities.newMetrics[entityId];
    },
  },
});

export default NewMetrics;
