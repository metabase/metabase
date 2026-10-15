import { c, msgid, ngettext, t } from "ttag";

import { useGetIcon } from "metabase/hooks/use-icon";
import { Link } from "metabase/router";
import { Anchor, Card, Group, Stack, Text, Tooltip } from "metabase/ui";
import type {
  ContentDiagnosticsDuplicateEntity,
  ContentDiagnosticsDuplicatedFinding,
} from "metabase-types/api";

import { trackContentDiagnosticsDuplicateOpened } from "../../analytics";
import { DiagnosticsEntityIcon } from "../DiagnosticsEntityIcon";
import { DiagnosticsSidebar } from "../DiagnosticsSidebar";
import { TOOLTIP_OPEN_DELAY_MS } from "../constants";
import {
  getDuplicateEntityName,
  getDuplicateEntityUrl,
  getEntityTypeLabel,
} from "../utils";

import S from "./DuplicatedContentSidebar.module.css";

type DuplicatedContentSidebarProps = {
  finding: ContentDiagnosticsDuplicatedFinding;
  onClose: () => void;
};

export function DuplicatedContentSidebar({
  finding,
  onClose,
}: DuplicatedContentSidebarProps) {
  return (
    <DiagnosticsSidebar finding={finding} tab="duplicated" onClose={onClose}>
      <DuplicatesSection
        duplicateCount={finding.duplicate_count}
        duplicateEntities={finding.details.duplicate_entities}
      />
    </DiagnosticsSidebar>
  );
}

type DuplicatesSectionProps = {
  duplicateCount: number;
  duplicateEntities: ContentDiagnosticsDuplicateEntity[];
};

function DuplicatesSection({
  duplicateCount,
  duplicateEntities,
}: DuplicatesSectionProps) {
  const title = c("{0} is the number of duplicates of an item")
    .t`Duplicates (${duplicateCount})`;
  // Duplicates are filtered by permission- and personal-collection- server-side, so the list can be
  // shorter than the count the heading shows.
  const hiddenCount = duplicateCount - duplicateEntities.length;

  return (
    <Stack gap="sm" role="region" aria-label={t`Duplicates`}>
      <Text c="text-secondary" fz="sm" lh="h5">
        {title}
      </Text>
      {duplicateEntities.length > 0 && (
        <Card p={0} shadow="none" withBorder>
          {duplicateEntities.map((entity) => (
            <DuplicateEntityRow
              key={`${entity.entity_type}-${entity.id}`}
              entity={entity}
            />
          ))}
        </Card>
      )}
      {hiddenCount > 0 && (
        <Text c="text-secondary">
          {duplicateEntities.length === 0
            ? t`None of these duplicates are visible to you.`
            : ngettext(
                msgid`${hiddenCount} duplicate isn't visible to you.`,
                `${hiddenCount} duplicates aren't visible to you.`,
                hiddenCount,
              )}
        </Text>
      )}
    </Stack>
  );
}

type DuplicateEntityRowProps = {
  entity: ContentDiagnosticsDuplicateEntity;
};

function DuplicateEntityRow({ entity }: DuplicateEntityRowProps) {
  const getIcon = useGetIcon();
  const name = getDuplicateEntityName(entity);
  const typeLabel = getEntityTypeLabel(entity);

  const trackEntityOpened = () =>
    trackContentDiagnosticsDuplicateOpened({
      tab: "duplicated",
      entityId: entity.id,
      entityType: entity.entity_type,
    });
  const linkLabel = `${name}, ${typeLabel}`;

  return (
    <Group
      className={S.row}
      p="md"
      gap="md"
      wrap="nowrap"
      justify="space-between"
    >
      <Anchor
        className={S.wrap}
        component={Link}
        miw={0}
        to={getDuplicateEntityUrl(entity)}
        target="_blank"
        aria-label={linkLabel}
        onClick={trackEntityOpened}
      >
        <Group component="span" gap="sm" wrap="nowrap" miw={0}>
          <Tooltip label={typeLabel} openDelay={TOOLTIP_OPEN_DELAY_MS}>
            <DiagnosticsEntityIcon
              entity={entity}
              getIcon={getIcon}
              aria-hidden
            />
          </Tooltip>
          <span className={S.wrap}>{name}</span>
        </Group>
      </Anchor>
      {entity.view_count != null && (
        <Text className={S.nowrap} c="text-secondary">
          {ngettext(
            msgid`${entity.view_count} view`,
            `${entity.view_count} views`,
            entity.view_count,
          )}
        </Text>
      )}
    </Group>
  );
}
