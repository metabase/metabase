import { t } from "ttag";

import type { Revision, User } from "metabase-types/api";

// todo: unit test?
export function getTimelineEvents({
  revisions = [],
  currentUser,
}: {
  revisions: Revision[] | undefined;
  currentUser: User | null;
}) {
  return revisions.map(r => ({
    title: `${r.user.id === currentUser?.id ? t`You` : r.user.common_name} ${
      r.title
    }`,
    description: r.description,
    timestamp: r.timestamp,
    icon: "pencil",
    revision: r,
  }));
}
