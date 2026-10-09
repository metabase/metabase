import { t } from "ttag";

import { Link } from "metabase/router";
import { Anchor, Card, Stack, Text } from "metabase/ui";
import { formatDurationLong } from "metabase/utils/formatting";
import type { ContentDiagnosticsSlowFinding } from "metabase-types/api";

import { trackContentDiagnosticsEntityOpened } from "../../analytics";
import { DiagnosticsSidebar } from "../DiagnosticsSidebar";
import { getDuplicateEntityName, getDuplicateEntityUrl } from "../utils";

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
      tab="slow"
      onClose={onClose}
      extraInfo={{
        label: t`Duration`,
        children: formatDurationLong(finding.duration_ms),
      }}
    >
      {finding.details.slow_entities != null &&
        finding.details.slow_entities.length > 0 && (
          <Stack gap="sm" role="region" aria-label={t`Slow items`}>
            <Text c="text-secondary">{t`Slow items`}</Text>
            <Card withBorder p="md">
              <Stack gap="sm">
                {finding.details.slow_entities.map((entity) => (
                  <Anchor
                    key={entity.id}
                    component={Link}
                    to={getDuplicateEntityUrl(entity)}
                    target="_blank"
                    onClick={() =>
                      trackContentDiagnosticsEntityOpened({
                        tab: "slow",
                        entityId: entity.id,
                        entityType: entity.entity_type,
                      })
                    }
                  >
                    {getDuplicateEntityName(entity)}
                  </Anchor>
                ))}
              </Stack>
            </Card>
          </Stack>
        )}
    </DiagnosticsSidebar>
  );
}
