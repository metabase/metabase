import { msgid, ngettext, t } from "ttag";

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
  const contentCountLabel =
    tab === "crowded" &&
    finding.entity_type === "dashboard" &&
    details.unit === "dashcards"
      ? ngettext(
          msgid`${content_count} dashcard on one tab`,
          `${content_count} dashcards on one tab`,
          content_count,
        )
      : getContentCountLabel(content_count, details.unit);

  return (
    <DiagnosticsSidebar
      finding={finding}
      tab={tab}
      onClose={onClose}
      extraInfo={{
        label: t`Content count`,
        children: contentCountLabel,
      }}
    />
  );
}
