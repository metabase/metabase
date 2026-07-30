import { t } from "ttag";

import { formatDurationLong } from "metabase/utils/formatting/time";
import type { ContentDiagnosticsSlowFinding } from "metabase-types/api";

import { DiagnosticsSidebar } from "../DiagnosticsSidebar";

type SlowContentDiagnosticsSidebarProps = {
  finding: ContentDiagnosticsSlowFinding;
  onClose: () => void;
};

export function SlowContentDiagnosticsSidebar({
  finding,
  onClose,
}: SlowContentDiagnosticsSidebarProps) {
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
