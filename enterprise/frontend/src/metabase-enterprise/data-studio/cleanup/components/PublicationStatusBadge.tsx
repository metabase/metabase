import { t } from "ttag";

import { Badge } from "metabase/ui";

export function PublicationStatusBadge({ published }: { published: boolean }) {
  return (
    <Badge color={published ? "positive" : "neutral"}>
      {published ? t`Published` : t`Unpublished`}
    </Badge>
  );
}
