import { match } from "ts-pattern";
import { t } from "ttag";

/** The sentence for the error a refused start answers with. */
export function getRefusalMessage(error: unknown) {
  return match(getErrorCode(error))
    .with(
      "preview-target-admin",
      () => t`Admins can't be previewed, because they can see everything.`,
    )
    .with(
      "preview-target-not-a-person",
      "preview-target-deactivated",
      "preview-target-tenant-unavailable",
      () => t`Only active users who aren't admins can be previewed.`,
    )
    .with(
      "preview-target-tenant-group-empty",
      () =>
        t`This tenant group can't be previewed until it has at least one user.`,
    )
    .otherwise(() => t`This preview couldn't be started.`);
}

function getErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("data" in error)) {
    return null;
  }
  const { data } = error;

  if (typeof data !== "object" || data === null || !("error-code" in data)) {
    return null;
  }
  return data["error-code"];
}
