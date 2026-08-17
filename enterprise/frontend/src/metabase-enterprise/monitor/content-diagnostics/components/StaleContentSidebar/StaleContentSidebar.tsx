import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { Box } from "metabase/ui";
import type { ContentDiagnosticsStaleFinding } from "metabase-types/api";

import { DiagnosticsSidebar } from "../DiagnosticsSidebar";
import { getLastActiveLabel } from "../stale-utils";

type StaleContentSidebarProps = {
  finding: ContentDiagnosticsStaleFinding;
  onClose: () => void;
};

export function StaleContentSidebar({
  finding,
  onClose,
}: StaleContentSidebarProps) {
  const { last_active_at } = finding;

  return (
    <DiagnosticsSidebar
      finding={finding}
      onClose={onClose}
      extraInfo={{
        label: getLastActiveLabel(finding.entity_type),
        children:
          last_active_at != null ? (
            <DateTime value={last_active_at} unit="day" />
          ) : (
            <Box c="text-secondary">{t`Never`}</Box>
          ),
      }}
    />
  );
}
