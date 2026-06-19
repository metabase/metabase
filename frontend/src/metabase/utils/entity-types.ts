// backend returns model = "card" instead of "question"
export const entityTypeForModel = (model: string): string => {
  if (model === "card" || model === "dataset" || model === "metric") {
    return "questions";
  }
  return `${model}s`;
};

export const entityTypeForObject = (
  object?: { model: string } | null,
): string | undefined =>
  object ? entityTypeForModel(object.model) : undefined;
