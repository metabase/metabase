import { t } from "ttag";

import { RevisionHistoryTimeline } from "metabase/data-studio/common/components/RevisionHistory";
import { Stack } from "metabase/ui";
import type { Revision } from "metabase-types/api";

import { DocumentPageShell } from "../../components/DocumentPageShell";

import S from "./DocumentHistoryPage.module.css";

export function DocumentHistoryPage() {
  return (
    <DocumentPageShell data-testid="document-history-page">
      {(document) => (
        <Stack flex={1} className={S.scrollable}>
          <RevisionHistoryTimeline
            entityType="document"
            entityId={document.id}
            getActionDescription={getDocumentActionDescription}
          />
        </Stack>
      )}
    </DocumentPageShell>
  );
}

/** The backend's description, except for the events the timeline words itself */
function getDocumentActionDescription(revision: Revision): string {
  if (revision.is_creation) {
    return t`created this document`;
  }
  if (revision.is_reversion) {
    return t`reverted to a previous version`;
  }
  const archived = getArchivedAfter(revision.diff);
  if (archived === true) {
    return t`moved this document to the trash`;
  }
  if (archived === false) {
    return t`restored this document from the trash`;
  }
  return revision.description;
}

function getArchivedAfter(diff: Revision["diff"]): boolean | undefined {
  if (diff == null || !("after" in diff)) {
    return undefined;
  }
  const archived = diff.after.archived;
  return typeof archived === "boolean" ? archived : undefined;
}
