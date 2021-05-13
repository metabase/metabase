import { t } from "ttag";

export function getRevisionDescription(revision) {
  if (revision.is_creation) {
    return t`First revision.`;
  } else if (revision.is_reversion) {
    return t`Reverted to an earlier revision and ${revision.description}`;
  } else {
    return revision.description;
  }
}
