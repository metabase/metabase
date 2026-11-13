import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { useCreateMeasureMutation } from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { trackMeasureCreated } from "metabase/common/data-studio/analytics";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useMetadataToasts } from "metabase/common/hooks";
import { getDatasetQueryPreviewUrl } from "metabase/data-studio/common/utils/get-dataset-query-preview-url";
import { PROPOSAL_SEARCH_PARAM } from "metabase/data-studio/data-model/pages/DataModel/TableSection/ListSection";
import { useMeasureProposal } from "metabase/data-studio/data-model/pages/DataModel/TableSection/MeasureList/MeasureProposals";
import {
  type MetadataSelectorOpts,
  useMetadataProvider,
  useQuestionFromOptsBuilder,
} from "metabase/metadata-store";
import { useNavigate, useSearchParams } from "metabase/router";
import { Button, Group } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { DatasetQuery, Measure, Table } from "metabase-types/api";

import { MeasureEditor } from "../../components/MeasureEditor";
import { useMeasureQuery } from "../../hooks/use-measure-query";
import { createInitialQueryForTable } from "../../utils/measure-query";

import { NewMeasureHeader } from "./NewMeasureHeader";

// Hoisted: the metadata selector memoises on the options object, so a fresh
// literal each render would defeat it.
const WITH_HIDDEN_TABLES: MetadataSelectorOpts = { includeHiddenTables: true };

/** What the page started from, to tell whether anything changed since */
type Draft = { name: string; description: string; definition: DatasetQuery };

type NewMeasurePageProps = {
  table: Table;
  breadcrumbs: ReactNode;
  getSuccessUrl: (measure: Measure) => string;
  /** Where Cancel goes; without it there's no Cancel */
  cancelUrl?: string;
};

export function NewMeasurePage({
  table,
  breadcrumbs,
  getSuccessUrl,
  cancelUrl,
}: NewMeasurePageProps) {
  const navigate = useNavigate();
  const buildQuestion = useQuestionFromOptsBuilder();
  const metadataProvider = useMetadataProvider(
    table?.db_id ?? null,
    WITH_HIDDEN_TABLES,
  );
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  // PROTOTYPE: opened from a proposed measure, the page starts as that
  // measure; saving it retires the proposal, cancelling leaves it proposed
  const [searchParams] = useSearchParams();
  const proposal = useMeasureProposal(
    table,
    searchParams.get(PROPOSAL_SEARCH_PARAM),
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [definition, setDefinition] = useState<DatasetQuery | null>(null);
  const [proposalDraft, setProposalDraft] = useState<Draft | null>(null);
  const [savedMeasure, setSavedMeasure] = useState<Measure | null>(null);
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
  const { proposal: proposedMeasure, definition: proposedDefinition } =
    proposal;
  useEffect(() => {
    if (proposedMeasure && proposedDefinition && proposalDraft == null) {
      const draft = {
        name: proposedMeasure.name,
        description: proposedMeasure.signal,
        definition: proposedDefinition,
      };
      setProposalDraft(draft);
      setName(draft.name);
      setDescription(draft.description);
      setDefinition(draft.definition);
    }
  }, [proposedMeasure, proposedDefinition, proposalDraft]);

  const { query, aggregations } = useMeasureQuery(definition);

  const isChanged = proposalDraft
    ? name.trim() !== proposalDraft.name ||
      description !== proposalDraft.description ||
      JSON.stringify(definition) !== JSON.stringify(proposalDraft.definition)
    : name.trim().length > 0 ||
      description.length > 0 ||
      aggregations.length > 0;
  const isDirty = !savedMeasure && isChanged;
  const isValid = aggregations.length === 1;
  const previewUrl =
    aggregations.length === 1
      ? getDatasetQueryPreviewUrl(definition, buildQuestion)
      : undefined;

  const setQuery = useCallback((newQuery: Lib.Query) => {
    setDefinition(Lib.toJsQuery(newQuery));
  }, []);

  const [createMeasure, { isLoading: isSaving }] = useCreateMeasureMutation();

  const handleSave = useCallback(async () => {
    if (!table || !definition || !isValid) {
      return;
    }
    const { data: measure, error } = await createMeasure({
      // PROTOTYPE: an unnamed measure takes the placeholder's name
      name: name.trim() || t`New measure`,
      definition: definition,
      description: description.trim() || undefined,
    });

    if (error) {
      trackMeasureCreated("failure");
      sendErrorToast(t`Failed to create measure`);
    } else if (measure) {
      trackMeasureCreated("success", measure.id);
      if (proposalDraft) {
        proposal.resolve();
      }
      setSavedMeasure(measure);
      sendSuccessToast(t`Measure created`);
    }
  }, [
    table,
    definition,
    name,
    description,
    isValid,
    proposal,
    proposalDraft,
    createMeasure,
    sendSuccessToast,
    sendErrorToast,
  ]);

  useEffect(() => {
    if (savedMeasure) {
      navigate(getSuccessUrl(savedMeasure));
    }
  }, [savedMeasure, getSuccessUrl, navigate]);

  // Cancel goes once the leave guard is off
  useEffect(() => {
    if (isCancelling && cancelUrl) {
      navigate(cancelUrl);
    }
  }, [isCancelling, cancelUrl, navigate]);

  // A proposal can be saved as it is; a blank measure needs a change first
  const canSave = isDirty || (proposalDraft != null && !savedMeasure);

  return (
    <PageContainer data-testid="new-measure-page" gap="xxl">
      <NewMeasureHeader
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
      <MeasureEditor
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
