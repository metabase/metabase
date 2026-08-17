import { t } from "ttag";

import { formatDurationLong } from "metabase/utils/formatting";
import type { ContentDiagnosticsSlowFinding } from "metabase-types/api";

import { DiagnosticsSidebar } from "../DiagnosticsSidebar";

type SlowContentSidebarProps = {
  finding: ContentDiagnosticsSlowFinding;
  onClose: () => void;
};

export function SlowContentSidebar({
  finding,
  onClose,
}: SlowContentSidebarProps) {
  return (
    <DiagnosticsSidebar
      finding={finding}
      onClose={onClose}
      extraInfo={{
        label: t`Duration`,
        children: formatDurationLong(finding.duration_ms),
      }}
    />
  );
}
