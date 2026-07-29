import { skipToken } from "@reduxjs/toolkit/query";
import { useEffect, useRef, useState } from "react";
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
  Drawer,
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
import { CreateCandidateModal } from "./CreateCandidateModal";
import { DismissCandidateModal } from "./DismissCandidateModal";
import { ModelingStatusBadge } from "./ModelingStatusBadge";

const DRAWER_SIZE = "min(48rem, 100vw)";

function getErrorStatus(error: unknown) {
  return typeof error === "object" && error != null && "status" in error
    ? error.status
    : undefined;
}

type CandidateDrawerProps = {
  candidateId: number | undefined;
  onClose: () => void;
  onStale: () => void;
  onTablePublished: () => void;
};

export function CandidateDrawer({
  candidateId,
  onClose,
  onStale,
  onTablePublished,
}: CandidateDrawerProps) {
  const dispatch = useDispatch();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDismissModal, setShowDismissModal] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const staleCandidateId = useRef<number | undefined>(undefined);
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const candidateQuery = useGetUsageMetadataCandidateQuery(
    candidateId ?? skipToken,
  );
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
      <Drawer
        opened={candidateId != null}
        onClose={onClose}
        position="right"
        size={DRAWER_SIZE}
        padding={0}
        withCloseButton={false}
        withOverlay={false}
        lockScroll={false}
        shadow="lg"
        zIndex={100}
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
          <CandidateDrawerBody
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
      </Drawer>
      {candidate && (
        <>
          <CreateCandidateModal
            key={`create-${candidate.id}`}
            candidate={candidate}
            opened={showCreateModal}
            onClose={() => setShowCreateModal(false)}
            onCreated={handleCreated}
            onStale={handleStale}
          />
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

type CandidateDrawerBodyProps = {
  candidate: UsageMetadataCandidateDetail;
  onClose: () => void;
  onCreate: () => void;
  onDismiss: () => void;
  onRestore: () => void;
  onPublish: () => void;
};

function CandidateDrawerBody({
  candidate,
  onClose,
  onCreate,
  onDismiss,
  onRestore,
  onPublish,
}: CandidateDrawerBodyProps) {
  const exactMatch = candidate.matches.find(
    (match) => match.relation === "exact",
  );
  const hasPublishedBlocker = candidate.creation_blockers.includes(
    "table-not-published",
  );
  const hasHardBlocker = candidate.creation_blockers.some(
    (blocker) => blocker !== "table-not-published",
  );

  return (
    <Stack h="100%" gap={0}>
      <Group p="lg" justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" miw={0}>
          <Icon name={getCandidateIcon(candidate)} />
          <Title order={3}>{candidate.suggested_name}</Title>
        </Group>
        <ActionIcon onClick={onClose} aria-label={t`Close candidate details`}>
          <Icon name="close" />
        </ActionIcon>
      </Group>
      <Divider />
      <Stack p="lg" gap="xl" style={{ overflowY: "auto" }}>
        <Stack gap="sm">
          <CandidateStatusCard candidate={candidate} />
          <CandidateDefinition candidate={candidate} />
        </Stack>

        <EvidenceSection candidate={candidate} />

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
            <SourceRow key={source.id} source={source} />
          ))}
        </Stack>

        {candidate.creation_blockers.length > 0 && (
          <Stack gap="xs">
            {candidate.creation_blockers.map((blocker) => (
              <Text key={blocker} size="sm" c="text-secondary">
                {getCreationBlockerLabel(blocker)}
              </Text>
            ))}
          </Stack>
        )}
      </Stack>
      <Box mt="auto" p="lg" bd="1px 0 0 0 solid var(--mb-color-border)">
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
          {candidate.modeling_status === "modeled" && exactMatch ? (
            <Button
              component={Link}
              to={getMatchUrl(candidate.table.id, exactMatch)}
            >
              {t`View in Library`}
            </Button>
          ) : hasPublishedBlocker ? (
            <Button onClick={onPublish}>{t`Publish table first`}</Button>
          ) : (
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
          )}
        </Group>
      </Box>
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

function SourceRow({ source }: { source: UsageMetadataCandidateSource }) {
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
          {source.joined && <Badge variant="light">{t`Joined`}</Badge>}
          <Badge variant="light">
            {t`Stages ${source.stage_numbers.join(", ")}`}
          </Badge>
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
      </Stack>
    </Card>
  );
}
