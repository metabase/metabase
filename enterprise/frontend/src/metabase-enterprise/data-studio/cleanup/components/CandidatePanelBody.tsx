import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Group,
  Icon,
  Stack,
  Text,
  Title,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type {
  UsageMetadataCandidateDetail,
  UsageMetadataCandidateMatch,
  UsageMetadataCandidateSource,
  UsageMetadataCandidateType,
} from "metabase-types/api";

import {
  getCreationBlockerLabel,
  getMatchRelationLabel,
  isCreationCandidate,
} from "../utils";

import { CandidateDefinition, getCandidateIcon } from "./CandidateDefinition";
import { EvidenceBadges } from "./EvidenceBadges";
import { ModelingStatusBadge } from "./ModelingStatusBadge";
import { PublicationStatusBadge } from "./PublicationStatusBadge";

type CandidatePanelBodyProps = {
  candidate: UsageMetadataCandidateDetail;
  onClose: () => void;
  onCreate: () => void;
  onDismiss: () => void;
  onRestore: () => void;
  onPublish: () => void;
};

export function CandidatePanelBody({
  candidate,
  onClose,
  onCreate,
  onDismiss,
  onRestore,
  onPublish,
}: CandidatePanelBodyProps) {
  const canCreateCandidate = isCreationCandidate(candidate);
  const hasPublishedBlocker = candidate.creation_blockers.includes(
    "table-not-published",
  );
  const hasHardBlocker = candidate.creation_blockers.some(
    (blocker) => blocker !== "table-not-published",
  );

  return (
    <Stack h="100%" gap={0}>
      <Group p="lg" justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" miw={0} flex={1}>
          <Icon name={getCandidateIcon(candidate)} />
          <Title order={3} flex={1} lineClamp={2}>
            {candidate.display_name}
          </Title>
        </Group>
        <ActionIcon
          onClick={onClose}
          aria-label={t`Close candidate details`}
          style={{ flexShrink: 0 }}
        >
          <Icon name="close" />
        </ActionIcon>
      </Group>
      <Divider />
      <Stack p="lg" gap="xl" flex={1} mih={0} style={{ overflowY: "auto" }}>
        <Stack gap="sm">
          <CandidateStatusCard candidate={candidate} />
          <CandidateDefinition candidate={candidate} />
        </Stack>

        <EvidenceSection candidate={candidate} />

        {candidate.required_tables.length > 0 && (
          <Stack gap="sm">
            <Text fw="bold">{t`Required tables`}</Text>
            {candidate.required_tables.map((table) => (
              <Card key={table.id} withBorder p="sm">
                <Group justify="space-between" wrap="nowrap">
                  <Stack gap={2} miw={0}>
                    <Text fw="bold" truncate>
                      {table.display_name}
                    </Text>
                    <Text size="sm" c="text-secondary" truncate>
                      {[table.database.name, table.schema]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </Stack>
                  <PublicationStatusBadge published={table.is_published} />
                </Group>
              </Card>
            ))}
          </Stack>
        )}

        {candidate.matches.length > 0 && (
          <Stack gap="sm">
            <Text fw="bold">{t`Related Library entities`}</Text>
            {candidate.matches.map((match) => (
              <MatchRow
                key={`${match.entity_type}-${match.entity.id}-${match.relation}`}
                tableId={candidate.table.id}
                match={match}
              />
            ))}
          </Stack>
        )}

        <Stack gap="sm">
          <Text fw="bold">{t`Used by saved content`}</Text>
          {candidate.sources.map((source) => (
            <SourceRow
              key={source.card_id}
              source={source}
              candidateType={candidate.candidate_type}
            />
          ))}
        </Stack>

        {candidate.modeling_status !== "modeled" &&
          candidate.creation_blockers.length > 0 && (
            <Stack gap="xs">
              {candidate.creation_blockers.map((blocker) => (
                <Text key={blocker} size="sm" c="text-secondary">
                  {getCreationBlockerLabel(blocker)}
                </Text>
              ))}
            </Stack>
          )}
      </Stack>
      {candidate.modeling_status !== "modeled" && (
        <Box
          mt="auto"
          p="lg"
          style={{ borderTop: "1px solid var(--mb-color-border-neutral)" }}
        >
          <Group justify="space-between" wrap="nowrap">
            {candidate.dismissed ? (
              <Button variant="subtle" onClick={onRestore}>
                {t`Restore candidate`}
              </Button>
            ) : (
              <Button variant="subtle" color="error" onClick={onDismiss}>
                {t`Dismiss`}
              </Button>
            )}
            {candidate.candidate_type === "table" &&
            !candidate.table.is_published ? (
              <Button onClick={onPublish}>{t`Publish table`}</Button>
            ) : canCreateCandidate && hasPublishedBlocker ? (
              <Button onClick={onPublish}>{t`Publish table first`}</Button>
            ) : canCreateCandidate ? (
              <Tooltip
                label={
                  hasHardBlocker
                    ? candidate.creation_blockers
                        .map(getCreationBlockerLabel)
                        .join(" ")
                    : undefined
                }
                disabled={!hasHardBlocker}
              >
                <Button disabled={hasHardBlocker} onClick={onCreate}>
                  {candidate.candidate_type === "measure"
                    ? t`Create Measure`
                    : t`Create Segment`}
                </Button>
              </Tooltip>
            ) : null}
          </Group>
        </Box>
      )}
    </Stack>
  );
}

function CandidateStatusCard({
  candidate,
}: {
  candidate: UsageMetadataCandidateDetail;
}) {
  const { title, description } = getCandidateStatusCopy(candidate);

  return (
    <Card withBorder p="md">
      <Stack gap="xs">
        <Group gap="sm">
          <ModelingStatusBadge status={candidate.modeling_status} />
          <Text fw="bold">{title}</Text>
        </Group>
        <Text size="sm" c="text-secondary">
          {description}
        </Text>
      </Stack>
    </Card>
  );
}

function getCandidateStatusCopy(candidate: UsageMetadataCandidateDetail) {
  if (candidate.candidate_type === "table") {
    if (candidate.table.is_published) {
      return {
        title: t`Table is now published`,
        description: t`This table was published after the analysis. Refresh the analysis to remove this recommendation.`,
      };
    }
    return {
      title: t`Table is used by important saved content`,
      description: t`This physical table is not published in the Library, but curated or frequently used content depends on it.`,
    };
  }

  if (candidate.candidate_type === "metric") {
    return {
      title: t`Question could be a reusable Metric`,
      description: t`This question has a complete Metric-shaped definition that can be traced to publishable physical tables.`,
    };
  }

  const entityType =
    candidate.candidate_type === "measure" ? t`Measure` : t`Segment`;

  switch (candidate.modeling_status) {
    case "missing":
      return {
        title: t`${entityType} is missing from the Library`,
        description: t`Saved content uses this definition, but the Library has no related ${entityType}.`,
      };
    case "partially-modeled":
      return {
        title: t`${entityType} differs from related Library definitions`,
        description: t`Compare the related definitions before deciding whether to create another ${entityType}.`,
      };
    case "modeled":
      return {
        title: t`${entityType} is already modeled, but still used raw`,
        description: t`An exact Library ${entityType} exists, but saved content still uses this raw definition.`,
      };
  }
}

function EvidenceSection({
  candidate,
}: {
  candidate: UsageMetadataCandidateDetail;
}) {
  const evidence = candidate.evidence;
  return (
    <Stack gap="sm">
      <Text fw="bold">{t`Evidence`}</Text>
      <Group gap="xs">
        <EvidenceBadges
          verified={evidence.verified_source_count > 0}
          official={evidence.official_source_count > 0}
          popular={evidence.popular_source_count > 0}
        />
        <Text size="sm" c="text-secondary">
          {t`${evidence.distinct_source_count} sources · ${evidence.recent_view_count} recent views`}
        </Text>
      </Group>
    </Stack>
  );
}

function MatchRow({
  tableId,
  match,
}: {
  tableId: UsageMetadataCandidateDetail["table"]["id"];
  match: UsageMetadataCandidateMatch;
}) {
  return (
    <Card withBorder p="sm">
      <Group justify="space-between" wrap="nowrap">
        <Stack gap={2} miw={0}>
          <Link to={getMatchUrl(tableId, match)}>{match.entity.name}</Link>
          <Text size="sm" c="text-secondary" truncate>
            {match.entity.description}
          </Text>
        </Stack>
        <Badge variant="light">{getMatchRelationLabel(match.relation)}</Badge>
      </Group>
    </Card>
  );
}

function getMatchUrl(
  tableId: UsageMetadataCandidateDetail["table"]["id"],
  match: UsageMetadataCandidateMatch,
) {
  return match.entity_type === "measure"
    ? Urls.dataStudioPublishedTableMeasure(tableId, match.entity.id)
    : Urls.dataStudioPublishedTableSegment(tableId, match.entity.id);
}

function SourceRow({
  source,
  candidateType,
}: {
  source: UsageMetadataCandidateSource;
  candidateType: UsageMetadataCandidateType;
}) {
  return (
    <Card withBorder p="sm">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Link
            to={Urls.card({
              id: source.card_id,
              name: source.card_name ?? undefined,
              type: source.card_type,
            })}
          >
            {source.card_name ?? t`Untitled saved content`}
          </Link>
          <Text size="sm" c="text-secondary">
            {t`${source.recent_view_count} recent views`}
          </Text>
        </Group>
        <Group gap="xs">
          <Badge variant="light">
            {source.card_type === "model" ? t`Model` : t`Question`}
          </Badge>
          <EvidenceBadges
            verified={source.verified}
            official={source.official}
            popular={source.popular}
            variant="filled"
          />
          {candidateType !== "table" && (
            <>
              {source.joined && <Badge variant="light">{t`Joined`}</Badge>}
              <Badge variant="light">
                {t`Stages ${source.stage_numbers.join(", ")}`}
              </Badge>
            </>
          )}
        </Group>
        {source.model_lineage && source.model_lineage.length > 0 && (
          <Text size="sm" c="text-secondary">
            {t`Through models:`}{" "}
            {source.model_lineage.map((model, index) => (
              <span key={model.id}>
                {index > 0 && " → "}
                <Link to={Urls.model(model)}>{model.name}</Link>
              </span>
            ))}
          </Text>
        )}
        {source.dependency_paths?.map((path, pathIndex) => (
          <Text key={pathIndex} size="sm" c="text-secondary">
            {path.direct ? (
              t`Direct table dependency`
            ) : path.models.length > 0 ? (
              <>
                {t`Through models:`}{" "}
                {path.models.map((model, index) => (
                  <span key={model.id}>
                    {index > 0 && " → "}
                    <Link to={Urls.model(model)}>{model.name}</Link>
                  </span>
                ))}
              </>
            ) : (
              t`Table dependency`
            )}
          </Text>
        ))}
      </Stack>
    </Card>
  );
}
