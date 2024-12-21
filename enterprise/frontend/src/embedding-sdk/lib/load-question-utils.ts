import type { ParameterValues } from "embedding-sdk/components/private/InteractiveQuestion/context";

export const getParameterDependencyKey = (
  parameters?: ParameterValues,
): string =>
  Object.entries(parameters ?? {})
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([key, value]) => `${key}=${value}`)
    .join(":");
