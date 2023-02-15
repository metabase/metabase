// backend returns model = "card" instead of "question"
export const entityTypeForModel = model => {
  if (model === "card" || model === "dataset") {
    return "questions";
  }
  return `${model}s`;
};

export const entityTypeForObject = object =>
  object && entityTypeForModel(object.model);
