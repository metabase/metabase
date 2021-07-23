import { t } from "ttag";

export const REVISION_EVENT_ICON = "pencil";

export function getRevisionDescription(revision) {
  if (isCreationEvent(revision)) {
    return "First revision.";
  } else if (isReversionEvent(revision)) {
    return t`Reverted to an earlier revision and ${revision.description}`;
  } else {
    return revision.description;
  }
}

export function getRevisionEventsForTimeline(revisions = [], canWrite) {
  return revisions.map((revision, index) => {
    const isCreation = isCreationEvent(revision);
    const isRevertable = canWrite && index !== 0;
    const username = getRevisionUsername(revision);
    return {
      timestamp: getRevisionEpochTimestamp(revision),
      icon: REVISION_EVENT_ICON,
      title: isCreation
        ? t`${username} created this`
        : t`${username} edited this`,
      description: isCreation ? undefined : getRevisionDescription(revision),
      isRevertable,
      revision,
    };
  });
}

function isCreationEvent(revision) {
  return revision.is_creation;
}

function isReversionEvent(revision) {
  return revision.is_reversion;
}

function getRevisionUsername(revision) {
  return revision.user.common_name;
}

function getRevisionEpochTimestamp(revision) {
  return new Date(revision.timestamp).valueOf();
}
