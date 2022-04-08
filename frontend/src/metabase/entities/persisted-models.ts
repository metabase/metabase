import { PersistedModelSchema } from "metabase/schema";
import { createEntity } from "metabase/lib/entities";

const PersistedModels = createEntity({
  name: "persistedModels",
  nameOne: "persistedModel",
  path: "/api/persist",
  schema: PersistedModelSchema,
});

export default PersistedModels;
