import { PLUGIN_ENTITIES } from "metabase/plugins";

// backend returns model = "card" instead of "question"
export const entityTypeForModel = (model) => {
  if (model === "card" || model === "dataset" || model === "metric") {
    return "questions";
  }
  if (model === "indexed-entity") {
    // handle non-standard plural 🙃
    return "indexedEntities";
  }
  return `${model}s`;
};

export const entityTypeForObject = (object) =>
  object && entityTypeForModel(object.model);

export const entityForObject = (object) => {
  // Dynamic require to avoid circular dependency:
  // schema.js → lib/schema → entities → entity files → schema.js
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const entities = require("metabase/entities");
  const enterpriseEntities = PLUGIN_ENTITIES.entities;

  return { ...entities, ...enterpriseEntities }[entityTypeForObject(object)];
};
