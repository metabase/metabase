import { t } from "ttag";
import {
  isValidRevision,
  getChangedFields,
  getRevisionDescription,
} from "./utils";

export const REVISION_EVENT_ICON = "pencil";

export function getRevisionEventsForTimeline(revisions = [], canWrite) {
  return revisions
    .filter(isValidRevision)
    .map((revision, index) => {
      const isRevertable = canWrite && index !== 0;
      const username = getRevisionUsername(revision);
      const message = getRevisionDescription(revision);

      // If > 1 item's fields are changed in a single revision,
      // the changes are batched into a single string like:
      // "added a description, moved cards around and archived this"
      // Batched messages can be long, so if the revision's diff contains > 1 field,
      // we want to show the changelog in a description and set a title to just "User edited this"
      // If only one field is changed, we just show everything in the title
      // like "John added a description"
      const areMultipleFieldsChanged = getChangedFields(revision).length > 1;
      const title = areMultipleFieldsChanged
        ? username + " " + t`edited this`
        : `${username} ${message}`;
      const description = areMultipleFieldsChanged
        ? capitalize(message)
        : undefined;

      return {
        timestamp: getRevisionEpochTimestamp(revision),
        icon: REVISION_EVENT_ICON,
        title,
        description,
        isRevertable,
        revision,
      };
    })
    .filter(Boolean);
}

function getRevisionUsername(revision) {
  return revision.user.common_name;
}

function getRevisionEpochTimestamp(revision) {
  return new Date(revision.timestamp).valueOf();
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
