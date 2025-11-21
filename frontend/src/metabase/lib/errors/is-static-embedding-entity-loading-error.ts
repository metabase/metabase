import type { StaticEmbeddingEntityError } from "metabase/lib/errors/types";

export const isStaticEmbeddingEntityLoadingError = (
  error: unknown,
): error is StaticEmbeddingEntityError => {
  return (
    !!error &&
    typeof error === "object" &&
    "status" in error &&
    "data" in error &&
    typeof error.data === "string"
  );
};
