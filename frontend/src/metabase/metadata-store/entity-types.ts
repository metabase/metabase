/**
 * The slice a model's records live in. The backend says "card" where the mirror
 * keys them under "questions".
 */
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
