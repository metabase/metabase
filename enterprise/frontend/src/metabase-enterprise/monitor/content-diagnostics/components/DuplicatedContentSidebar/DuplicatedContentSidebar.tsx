import { c, msgid, ngettext, t } from "ttag";

import { Link } from "metabase/router";
import {
  Anchor,
  Box,
  Card,
  FixedSizeIcon,
  Group,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import type {
  ContentDiagnosticsDuplicateEntity,
  ContentDiagnosticsDuplicatedFinding,
} from "metabase-types/api";

import { DiagnosticsSidebar } from "../DiagnosticsSidebar";
import {
  getDuplicateEntityName,
  getDuplicateEntityUrl,
  getEntityIcon,
  getEntityTypeLabel,
} from "../utils";

import S from "./DuplicatedContentSidebar.module.css";

const TOOLTIP_OPEN_DELAY_MS = 300;

type DuplicatedContentSidebarProps = {
  finding: ContentDiagnosticsDuplicatedFinding;
  onClose: () => void;
};

export function DuplicatedContentSidebar({
  finding,
  onClose,
}: DuplicatedContentSidebarProps) {
  return (
    <DiagnosticsSidebar finding={finding} onClose={onClose}>
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
      <Box c="text-secondary" fz="sm" lh="h5">
        {title}
      </Box>
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
  const name = getDuplicateEntityName(entity);
  const typeLabel = getEntityTypeLabel(entity);
  const linkLabel = `${name}, ${typeLabel}`;

  return (
    <Group
      className={S.row}
      p="md"
      gap="md"
      wrap="nowrap"
      justify="space-between"
    >
      <Group gap="sm" wrap="nowrap" miw={0}>
        <Tooltip label={typeLabel} openDelay={TOOLTIP_OPEN_DELAY_MS}>
          <FixedSizeIcon name={getEntityIcon(entity)} />
        </Tooltip>
        <Anchor
          className={S.wrap}
          component={Link}
          to={getDuplicateEntityUrl(entity)}
          target="_blank"
          aria-label={linkLabel}
        >
          {name}
        </Anchor>
      </Group>
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
