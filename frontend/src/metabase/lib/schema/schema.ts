import { PLUGIN_ENTITIES } from "metabase/plugins";

// backend returns model = "card" instead of "question"
export const entityTypeForModel = (model: string): string => {
  if (model === "card" || model === "dataset" || model === "metric") {
    return "questions";
  }
  if (model === "indexed-entity") {
    // handle non-standard plural 🙃
    return "indexedEntities";
  }
  return `${model}s`;
};

export const entityTypeForObject = (
  object?: { model: string } | null,
): string | undefined =>
  object ? entityTypeForModel(object.model) : undefined;

export const entityForObject = (object?: { model: string } | null) => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic require due to circular dependencies
  const entities = require("metabase/entities");
  const enterpriseEntities = PLUGIN_ENTITIES.entities;
  const entityType = entityTypeForObject(object);
  if (!entityType) {
    return undefined;
  }
  return { ...entities, ...enterpriseEntities }[entityType];
};
