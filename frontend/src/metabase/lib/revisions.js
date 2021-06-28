import { t } from "ttag";

export function getRevisionDescription(revision) {
  if (revision.is_creation) {
    return "First revision.";
  } else if (revision.is_reversion) {
    return t`Reverted to an earlier revision and ${revision.description}`;
  } else {
    return revision.description;
  }
}

export function getRevisionEvents(revisions, canWrite) {
  return revisions.map((revision, index) => {
    const canRevert = canWrite && index !== 0;
    const username = revision.user.common_name;
    return {
      timestamp: new Date(revision.timestamp).valueOf(),
      icon: "pencil",
      title: revision.is_creation
        ? t`${username} created this`
        : t`${username} edited this`,
      description: revision.is_creation
        ? undefined
        : getRevisionDescription(revision),
      showFooter: canRevert,
      revision,
    };
  });
}
