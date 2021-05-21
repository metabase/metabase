import { t } from "ttag";

export function getRevisionDescription(revision) {
  if (revision.is_creation) {
    return undefined;
  } else if (revision.is_reversion) {
    return t`Reverted to an earlier revision and ${revision.description}`;
  } else {
    return revision.description;
  }
}

export function getRevisionEvents(revisions) {
  return revisions.map((revision, index) => {
    // const canRevert = question.canWrite();
    const username = revision.user.common_name;
    return {
      timestamp: new Date(revision.timestamp).valueOf(),
      icon: "pencil",
      title: revision.is_creation
        ? t`${username} created this`
        : t`${username} edited this`,
      description: getRevisionDescription(revision),
      // showFooter: index !== 0 && canRevert,
      showFooter: false,
      revision,
    };
  });
}
