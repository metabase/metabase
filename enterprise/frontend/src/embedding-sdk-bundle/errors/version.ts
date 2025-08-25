import { MetabaseError } from "./base";

export function SDK_VERSION_INCOMPATIBLE(params: {
  expected?: string;
  actual?: string;
}) {
  return new MetabaseError(
    "SDK_VERSION_INCOMPATIBLE",
    `SDK version incompatibility: expected ${params.expected}, got ${params.actual}`,
    params,
  );
}
