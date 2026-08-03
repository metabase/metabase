import { type Ref, useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  trackDataStudioCleanupCandidateAction,
  trackDataStudioCleanupPublicationStarted,
} from "metabase/common/data-studio/analytics";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import { useDispatch } from "metabase/redux";
import { push } from "metabase/router";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Flex,
  Group,
  Icon,
  Stack,
  Text,
  Title,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import {
  usageMetadataApi,
  useGetUsageMetadataCandidateQuery,
  useRestoreUsageMetadataCandidateMutation,
} from "metabase-enterprise/api";
import type {
  UsageMetadataCandidateDetail,
  UsageMetadataCandidateMatch,
  UsageMetadataCandidateSource,
  UsageMetadataCandidateType,
} from "metabase-types/api";

import { getCreationBlockerLabel, getMatchRelationLabel } from "../utils";

import { CandidateDefinition, getCandidateIcon } from "./CandidateDefinition";
import S from "./CandidatePanel.module.css";
import { CreateCandidateModal } from "./CreateCandidateModal";
import { DismissCandidateModal } from "./DismissCandidateModal";
import { ModelingStatusBadge } from "./ModelingStatusBadge";

function getErrorStatus(error: unknown) {
  return typeof error === "object" && error != null && "status" in error
    ? error.status
    : undefined;
}

type CandidatePanelProps = {
  panelRef?: Ref<HTMLDivElement>;
  candidateId: number;
  onClose: () => void;
  onStale: () => void;
  onTablePublished: () => void;
};

export function CandidatePanel({
  panelRef,
  candidateId,
  onClose,
  onStale,
  onTablePublished,
}: CandidatePanelProps) {
  const dispatch = useDispatch();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDismissModal, setShowDismissModal] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const staleCandidateId = useRef<number | undefined>(undefined);
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const candidateQuery = useGetUsageMetadataCandidateQuery(candidateId);
  const [restoreCandidate] = useRestoreUsageMetadataCandidateMutation();
  const candidate = candidateQuery.data;

  useEffect(() => {
    if (
      candidateId != null &&
      getErrorStatus(candidateQuery.error) === 409 &&
      staleCandidateId.current !== candidateId
    ) {
      staleCandidateId.current = candidateId;
      onStale();
    }
  }, [candidateId, candidateQuery.error, onStale]);

  const handleStale = () => {
    setShowCreateModal(false);
    setShowDismissModal(false);
    onStale();
  };

  const handleCreated = (type: UsageMetadataCandidateType, id: number) => {
    setShowCreateModal(false);
    if (type !== "measure" && type !== "segment") {
      return;
    }
    const url =
      type === "measure"
        ? Urls.dataStudioPublishedTableMeasure(candidate!.table.id, id)
        : Urls.dataStudioPublishedTableSegment(candidate!.table.id, id);
    sendSuccessToast(
      type === "measure" ? t`Measure created` : t`Segment created`,
      () => dispatch(push(url)),
      t`View in Library`,
    );
  };

  const handleRestore = async () => {
    if (!candidate) {
      return;
    }
    try {
      await restoreCandidate(candidate.id).unwrap();
      trackDataStudioCleanupCandidateAction({
        action: "restore",
        candidateId: candidate.id,
        candidateType: candidate.candidate_type,
        result: "success",
      });
      sendSuccessToast(t`Candidate restored`);
    } catch (error) {
      trackDataStudioCleanupCandidateAction({
        action: "restore",
        candidateId: candidate.id,
        candidateType: candidate.candidate_type,
        result: "failure",
      });
      if (getErrorStatus(error) === 409) {
        handleStale();
      } else {
        sendErrorToast(t`The candidate could not be restored`);
      }
    }
  };

  const handleDismissed = () => {
    if (!candidate) {
      return;
    }
    setShowDismissModal(false);
    onClose();
    sendSuccessToast(
      t`Candidate dismissed`,
      async () => {
        try {
          await restoreCandidate(candidate.id).unwrap();
          trackDataStudioCleanupCandidateAction({
            action: "restore",
            candidateId: candidate.id,
            candidateType: candidate.candidate_type,
            result: "success",
          });
        } catch (error) {
          trackDataStudioCleanupCandidateAction({
            action: "restore",
            candidateId: candidate.id,
            candidateType: candidate.candidate_type,
            result: "failure",
          });
          if (getErrorStatus(error) === 409) {
            handleStale();
          } else {
            sendErrorToast(t`The candidate could not be restored`);
          }
        }
      },
      t`Undo`,
    );
  };

  const handlePublished = () => {
    setShowPublishModal(false);
    dispatch(
      usageMetadataApi.util.invalidateTags([
        { type: "usage-metadata-candidate", id: "LIST" },
        {
          type: "usage-metadata-candidate",
          id: `table-${candidate?.table.id}`,
        },
      ]),
    );
    candidateQuery.refetch();
    onTablePublished();
  };

  return (
    <>
      <Stack
        ref={panelRef}
        className={S.panel}
        h="100%"
        miw="36rem"
        w="40rem"
        maw="42rem"
        flex="0 0 40rem"
        gap={0}
        bg="background_page-secondary"
        role="complementary"
        aria-label={t`Candidate report`}
        data-testid="cleanup-candidate-panel"
      >
        {candidateQuery.isLoading ? (
          <Flex h="100%" align="center" justify="center">
            <LoadingAndErrorWrapper loading />
          </Flex>
        ) : candidateQuery.error || !candidate ? (
          <Flex h="100%" align="center" justify="center">
            <LoadingAndErrorWrapper error={candidateQuery.error} />
          </Flex>
        ) : (
          <CandidatePanelBody
            candidate={candidate}
            onClose={onClose}
            onCreate={() => setShowCreateModal(true)}
            onDismiss={() => setShowDismissModal(true)}
            onRestore={handleRestore}
            onPublish={() => {
              trackDataStudioCleanupPublicationStarted(
                Number(candidate.table.id),
              );
              setShowPublishModal(true);
            }}
          />
        )}
      </Stack>
      {candidate && (
        <>
          {(candidate.candidate_type === "measure" ||
            candidate.candidate_type === "segment") && (
            <CreateCandidateModal
              key={`create-${candidate.id}`}
              candidate={candidate}
              opened={showCreateModal}
              onClose={() => setShowCreateModal(false)}
              onCreated={handleCreated}
              onStale={handleStale}
            />
          )}
          <DismissCandidateModal
            key={`dismiss-${candidate.id}`}
            candidate={candidate}
            opened={showDismissModal}
            onClose={() => setShowDismissModal(false)}
            onDismissed={handleDismissed}
            onStale={handleStale}
          />
          <PLUGIN_LIBRARY.PublishTablesModal
            isOpened={showPublishModal}
            tableIds={[candidate.table.id]}
            onPublish={handlePublished}
            onClose={() => setShowPublishModal(false)}
          />
        </>
      )}
    </>
  );
}

type CandidatePanelBodyProps = {
  candidate: UsageMetadataCandidateDetail;
  onClose: () => void;
  onCreate: () => void;
  onDismiss: () => void;
  onRestore: () => void;
  onPublish: () => void;
};

function CandidatePanelBody({
  candidate,
  onClose,
  onCreate,
  onDismiss,
  onRestore,
  onPublish,
}: CandidatePanelBodyProps) {
  const isCreationCandidate =
    candidate.candidate_type === "measure" ||
    candidate.candidate_type === "segment";
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
                      {table["display-name"] ?? table.name}
                    </Text>
                    <Text size="sm" c="text-secondary" truncate>
                      {[table["database-name"], table.schema]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </Stack>
                  <Badge color={table["published?"] ? "positive" : "neutral"}>
                    {table["published?"] ? t`Published` : t`Unpublished`}
                  </Badge>
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
              key={source.id}
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
          style={{
            borderTop: "1px solid var(--mb-color-border-neutral)",
          }}
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
            ) : isCreationCandidate && hasPublishedBlocker ? (
              <Button onClick={onPublish}>{t`Publish table first`}</Button>
            ) : isCreationCandidate ? (
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
        {evidence.verified_source_count > 0 && (
          <Badge variant="light">{t`Verified`}</Badge>
        )}
        {evidence.official_source_count > 0 && (
          <Badge variant="light">{t`Official`}</Badge>
        )}
        {evidence.popular_source_count > 0 && (
          <Badge variant="light">{t`Popular`}</Badge>
        )}
        <Text size="sm" c="text-secondary">
          {t`${evidence.distinct_source_count} sources · ${evidence.total_view_count} views`}
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
            {t`${source.view_count} views`}
          </Text>
        </Group>
        <Group gap="xs">
          <Badge variant="light">
            {source.card_type === "model" ? t`Model` : t`Question`}
          </Badge>
          {source.verified && <Badge>{t`Verified`}</Badge>}
          {source.official && <Badge>{t`Official`}</Badge>}
          {source.popular && <Badge>{t`Popular`}</Badge>}
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
            {path["direct?"] || path.direct ? (
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
