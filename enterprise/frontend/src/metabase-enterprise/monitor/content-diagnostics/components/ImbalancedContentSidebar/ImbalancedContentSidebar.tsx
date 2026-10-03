import { t } from "ttag";

import { Box } from "metabase/ui";
import type {
  ContentDiagnosticsImbalancedFinding,
  ContentDiagnosticsImbalancedFindingType,
} from "metabase-types/api";

import { DiagnosticsSidebar } from "../DiagnosticsSidebar";
import { getContentCountLabel } from "../imbalanced-utils";

type ImbalancedContentSidebarProps = {
  finding: ContentDiagnosticsImbalancedFinding;
  tab: ContentDiagnosticsImbalancedFindingType;
  onClose: () => void;
};

export function ImbalancedContentSidebar({
  finding,
  tab,
  onClose,
}: ImbalancedContentSidebarProps) {
  const { content_count, details } = finding;

  return (
    <DiagnosticsSidebar
      finding={finding}
      tab={tab}
      onClose={onClose}
      extraInfo={{
        label: t`Content count`,
        children: (
          <Box>{getContentCountLabel(content_count, details.unit)}</Box>
        ),
      }}
    />
  );
}
