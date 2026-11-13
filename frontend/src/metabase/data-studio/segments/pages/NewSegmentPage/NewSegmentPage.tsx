import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { useCreateSegmentMutation } from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { trackSegmentCreated } from "metabase/common/data-studio/analytics";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useMetadataToasts } from "metabase/common/hooks";
import { getDatasetQueryPreviewUrl } from "metabase/data-studio/common/utils/get-dataset-query-preview-url";
import { PROPOSAL_SEARCH_PARAM } from "metabase/data-studio/data-model/pages/DataModel/TableSection/ListSection";
import { useCohortProposal } from "metabase/data-studio/data-model/pages/DataModel/TableSection/SegmentList/CohortProposals";
import {
  type MetadataSelectorOpts,
  useMetadataProvider,
  useQuestionFromOptsBuilder,
} from "metabase/metadata-store";
import { useNavigate, useSearchParams } from "metabase/router";
import { Button, Group } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { DatasetQuery, Segment, Table } from "metabase-types/api";

import { SegmentEditor } from "../../components/SegmentEditor";
import { useSegmentQuery } from "../../hooks/use-segment-query";
import { createInitialQueryForTable } from "../../utils/segment-query";

import { NewSegmentHeader } from "./NewSegmentHeader";

// Hoisted: the metadata selector memoises on the options object, so a fresh
// literal each render would defeat it.
const WITH_HIDDEN_TABLES: MetadataSelectorOpts = { includeHiddenTables: true };

/** What the page started from, to tell whether anything changed since */
type Draft = { name: string; description: string; definition: DatasetQuery };

type NewSegmentPageProps = {
  table: Table;
  breadcrumbs: ReactNode;
  getSuccessUrl: (segment: Segment) => string;
  /** Where Cancel goes; without it there's no Cancel */
  cancelUrl?: string;
};

export function NewSegmentPage({
  table,
  breadcrumbs,
  getSuccessUrl,
  cancelUrl,
}: NewSegmentPageProps) {
  const navigate = useNavigate();
  const buildQuestion = useQuestionFromOptsBuilder();
  const metadataProvider = useMetadataProvider(
    table?.db_id ?? null,
    WITH_HIDDEN_TABLES,
  );
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  // PROTOTYPE: opened from a proposed segment, the page starts as that
  // segment; saving it retires the proposal, cancelling leaves it proposed
  const [searchParams] = useSearchParams();
  const proposal = useCohortProposal(
    table,
    searchParams.get(PROPOSAL_SEARCH_PARAM),
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [definition, setDefinition] = useState<DatasetQuery | null>(null);
  const [proposalDraft, setProposalDraft] = useState<Draft | null>(null);
  const [savedSegment, setSavedSegment] = useState<Segment | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const isInitialized = useRef(false);

  useEffect(() => {
    if (table && !isInitialized.current) {
      isInitialized.current = true;
      setDefinition(createInitialQueryForTable(table, metadataProvider));
    }
  }, [table, metadataProvider]);

  // The proposal can resolve after the first render (its values load), so it
  // fills the page in once it's there
  const { proposal: proposedSegment, definition: proposedDefinition } =
    proposal;
  useEffect(() => {
    if (proposedSegment && proposedDefinition && proposalDraft == null) {
      const draft = {
        name: proposedSegment.name,
        description: proposedSegment.signal,
        definition: proposedDefinition,
      };
      setProposalDraft(draft);
      setName(draft.name);
      setDescription(draft.description);
      setDefinition(draft.definition);
    }
  }, [proposedSegment, proposedDefinition, proposalDraft]);

  const { query, filters } = useSegmentQuery(definition);

  const isChanged = proposalDraft
    ? name.trim() !== proposalDraft.name ||
      description !== proposalDraft.description ||
      JSON.stringify(definition) !== JSON.stringify(proposalDraft.definition)
    : name.trim().length > 0 || description.length > 0 || filters.length > 0;
  const isDirty = !savedSegment && isChanged;
  const isValid = filters.length > 0;
  const previewUrl =
    filters.length > 0
      ? getDatasetQueryPreviewUrl(definition, buildQuestion)
      : undefined;

  const setQuery = useCallback((newQuery: Lib.Query) => {
    setDefinition(Lib.toJsQuery(newQuery));
  }, []);

  const [createSegment, { isLoading: isSaving }] = useCreateSegmentMutation();

  const handleSave = useCallback(async () => {
    if (!table || !definition || !isValid) {
      return;
    }
    const { data: segment, error } = await createSegment({
      // PROTOTYPE: an unnamed segment takes the placeholder's name
      name: name.trim() || t`New segment`,
      definition: definition,
      description: description.trim() || undefined,
    });

    if (error) {
      trackSegmentCreated("failure", "data_studio_segments");
      sendErrorToast(t`Failed to create segment`);
    } else if (segment) {
      trackSegmentCreated("success", "data_studio_segments", segment.id);
      if (proposalDraft) {
        proposal.resolve();
      }
      setSavedSegment(segment);
      sendSuccessToast(t`Segment created`);
    }
  }, [
    table,
    definition,
    name,
    description,
    isValid,
    proposal,
    proposalDraft,
    createSegment,
    sendSuccessToast,
    sendErrorToast,
  ]);

  useEffect(() => {
    if (savedSegment) {
      navigate(getSuccessUrl(savedSegment));
    }
  }, [savedSegment, getSuccessUrl, navigate]);

  // Cancel goes once the leave guard is off
  useEffect(() => {
    if (isCancelling && cancelUrl) {
      navigate(cancelUrl);
    }
  }, [isCancelling, cancelUrl, navigate]);

  // A proposal can be saved as it is; a blank segment needs a change first
  const canSave = isDirty || (proposalDraft != null && !savedSegment);

  return (
    <PageContainer data-testid="new-segment-page" gap="xxl">
      <NewSegmentHeader
        // Fresh input once the proposal's name fills it in
        key={proposalDraft ? "proposal" : "blank"}
        initialName={proposalDraft?.name ?? ""}
        previewUrl={previewUrl}
        onNameChange={setName}
        breadcrumbs={breadcrumbs}
        actions={
          (cancelUrl || canSave) && (
            <Group gap="sm" wrap="nowrap">
              {cancelUrl && (
                <Button onClick={() => setIsCancelling(true)}>
                  {t`Cancel`}
                </Button>
              )}
              {canSave && (
                <Button
                  variant="filled"
                  disabled={!isValid}
                  loading={isSaving}
                  onClick={handleSave}
                >
                  {t`Save`}
                </Button>
              )}
            </Group>
          )
        }
      />
      <SegmentEditor
        query={query}
        description={description}
        onQueryChange={setQuery}
        onDescriptionChange={setDescription}
      />
      <LeaveRouteConfirmModal
        isEnabled={isDirty && !isSaving && !isCancelling}
      />
    </PageContainer>
  );
}
