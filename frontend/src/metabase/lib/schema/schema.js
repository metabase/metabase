import { PLUGIN_ENTITIES } from "metabase/plugins";

export const entityTypeForModel = (model) => {
  switch (model) {
    case "card":
    case "dataset":
    case "metric":
      return "questions";
    case "indexed-entity":
      return "indexedEntities";
    case "table-symlink":
      return "tableSymlinks";
    default:
      return `${model}s`;
  }
};

export const entityTypeForObject = (object) =>
  object && entityTypeForModel(object.model);

export const entityForObject = (object) => {
  const entities = require("metabase/entities");
  const enterpriseEntities = PLUGIN_ENTITIES.entities;

  return { ...entities, ...enterpriseEntities }[entityTypeForObject(object)];
};
