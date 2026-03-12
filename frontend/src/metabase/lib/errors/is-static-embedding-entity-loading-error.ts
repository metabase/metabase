import type { StaticEmbeddingEntityError } from "metabase/lib/errors/types";

export const isStaticEmbeddingEntityLoadingError = (
  error: unknown,
  { isGuestEmbed }: { isGuestEmbed: boolean },
): error is StaticEmbeddingEntityError => {
  if (!isGuestEmbed) {
    return false;
  }

  return (
    !!error &&
    typeof error === "object" &&
    "status" in error &&
    "data" in error &&
    typeof error.data === "string"
  );
};
