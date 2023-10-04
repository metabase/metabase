import { t } from "ttag";

import type { Revision, User } from "metabase-types/api";

export function getTimelineEvents({
  revisions = [],
  currentUser,
}: {
  revisions: Revision[] | undefined;
  currentUser: User | null;
}) {
  return revisions.map(r => {
    // If > 1 item's fields are changed in a single revision,
    // the changes are batched into a single string like:
    // "added a description, moved cards around and archived this"
    // Batched messages can be long, so if the revision's diff contains > 1 field,
    // we want to show the changelog in a description and set a title to just "User edited this"
    // If only one field is changed, we just show everything in the title
    // like "John added a description"
    const titleText = r.has_multiple_changes ? t`edited this.` : r.description;
    return {
      title: `${
        r.user.id === currentUser?.id ? t`You` : r.user.common_name
      } ${titleText}`,
      description: r.description,
      timestamp: r.timestamp,
      icon: "pencil" as const,
      revision: r,
    };
  });
}
