import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import type { Route } from "react-router";
import { t } from "ttag";

import { useUpdateSegmentMutation } from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { useSelector } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { getMetadata } from "metabase/selectors/metadata";
import { Button, Group } from "metabase/ui";
import { PageContainer } from "metabase-enterprise/data-studio/common/components/PageContainer";
import { getDatasetQueryPreviewUrl } from "metabase-enterprise/data-studio/common/utils/get-dataset-query-preview-url";
import { getUserCanWriteSegments } from "metabase-enterprise/data-studio/selectors";
import * as Lib from "metabase-lib";
import type { Segment } from "metabase-types/api";

import { SegmentEditor } from "../../components/SegmentEditor";
import { SegmentHeader } from "../../components/SegmentHeader";
import { useSegmentQuery } from "../../hooks/use-segment-query";
import type { SegmentTabUrls } from "../../types";

type SegmentDetailPageProps = {
  route: Route;
  segment: Segment;
  tabUrls: SegmentTabUrls;
  breadcrumbs: ReactNode;
  onRemove: () => Promise<void>;
};

export function SegmentDetailPage({
  route,
  segment,
  tabUrls,
  breadcrumbs,
  onRemove,
}: SegmentDetailPageProps) {
  const metadata = useSelector(getMetadata);
  const table = metadata.tables[segment.table_id];
  const canWriteSegments = useSelector((state) =>
    getUserCanWriteSegments(state, !!table?.is_published),
  );
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const [description, setDescription] = useState(segment.description ?? "");
  const [definition, setDefinition] = useState(segment.definition);
  const [savedSegment, setSavedSegment] = useState(segment);

  const { query, filters } = useSegmentQuery(definition, metadata);

  const isDirty = useMemo(
    () =>
      description !== (savedSegment.description ?? "") ||
      !Lib.areLegacyQueriesEqual(definition, savedSegment.definition),
    [description, definition, savedSegment],
  );

  const isValid = filters.length > 0;
  const previewUrl =
    filters.length > 0 ? getDatasetQueryPreviewUrl(definition) : undefined;

  const setQuery = useCallback((newQuery: Lib.Query) => {
    setDefinition(Lib.toJsQuery(newQuery));
  }, []);

  const [updateSegment, { isLoading: isSaving }] = useUpdateSegmentMutation();

  const handleSave = useCallback(async () => {
    if (!isValid) {
      return;
    }
    const { error } = await updateSegment({
      id: segment.id,
      name: segment.name,
      description: description.trim() || undefined,
      definition: definition,
      revision_message: t`Updated from Data Studio`,
    });

    if (error) {
      sendErrorToast(t`Failed to update segment`);
    } else {
      setSavedSegment({ ...segment, description, definition });
      sendSuccessToast(t`Segment updated`);
    }
  }, [
    segment,
    definition,
    description,
    isValid,
    updateSegment,
    sendSuccessToast,
    sendErrorToast,
  ]);

  const handleReset = useCallback(() => {
    setDescription(savedSegment.description ?? "");
    setDefinition(savedSegment.definition);
  }, [savedSegment]);

  return (
    <PageContainer data-testid="segment-detail-page">
      <SegmentHeader
        segment={segment}
        tabUrls={tabUrls}
        previewUrl={previewUrl}
        onRemove={canWriteSegments ? onRemove : undefined}
        readOnly={!canWriteSegments}
        breadcrumbs={breadcrumbs}
        actions={
          canWriteSegments &&
          isDirty && (
            <Group gap="sm">
              <Button onClick={handleReset}>{t`Cancel`}</Button>
              <Button
                variant="filled"
                disabled={!isValid}
                loading={isSaving}
                onClick={handleSave}
              >
                {t`Save`}
              </Button>
            </Group>
          )
        }
      />
      <SegmentEditor
        query={query}
        description={description}
        readOnly={!canWriteSegments}
        onQueryChange={setQuery}
        onDescriptionChange={setDescription}
      />
      {canWriteSegments && (
        <LeaveRouteConfirmModal
          key={segment.id}
          route={route}
          isEnabled={isDirty && !isSaving}
        />
      )}
    </PageContainer>
  );
}
