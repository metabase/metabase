// backend returns model = "card" instead of "question"
export const entityTypeForModel = model => {
  if (model === "card" || model === "dataset") {
    return "questions";
  }
  if (model === "indexed-entity") {
    // handle non-standard plural 🙃
    return "indexedEntities";
  }
  return `${model}s`;
};

export const entityTypeForObject = object =>
  object && entityTypeForModel(object.model);

export const entityForObject = object => {
  const entities = require("metabase/entities");
  return entities[entityTypeForObject(object)];
};
