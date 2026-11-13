import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { useCreateSegmentMutation } from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { trackSegmentCreated } from "metabase/common/data-studio/analytics";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useMetadataToasts } from "metabase/common/hooks";
import { getDatasetQueryPreviewUrl } from "metabase/data-studio/common/utils/get-dataset-query-preview-url";
import {
  type MetadataSelectorOpts,
  useMetadataProvider,
  useQuestionFromOptsBuilder,
} from "metabase/metadata-store";
import { useNavigate } from "metabase/router";
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

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [definition, setDefinition] = useState<DatasetQuery | null>(null);
  const [savedSegment, setSavedSegment] = useState<Segment | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const isInitialized = useRef(false);

  useEffect(() => {
    if (table && !isInitialized.current) {
      isInitialized.current = true;
      setDefinition(createInitialQueryForTable(table, metadataProvider));
    }
  }, [table, metadataProvider]);

  const { query, filters } = useSegmentQuery(definition);

  const isChanged =
    name.trim().length > 0 || description.length > 0 || filters.length > 0;
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
      setSavedSegment(segment);
      sendSuccessToast(t`Segment created`);
    }
  }, [
    table,
    definition,
    name,
    description,
    isValid,
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

  return (
    <PageContainer data-testid="new-segment-page" gap="xxl">
      <NewSegmentHeader
        previewUrl={previewUrl}
        onNameChange={setName}
        breadcrumbs={breadcrumbs}
        actions={
          (cancelUrl || isDirty) && (
            <Group gap="sm" wrap="nowrap">
              {cancelUrl && (
                <Button onClick={() => setIsCancelling(true)}>
                  {t`Cancel`}
                </Button>
              )}
              {isDirty && (
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
