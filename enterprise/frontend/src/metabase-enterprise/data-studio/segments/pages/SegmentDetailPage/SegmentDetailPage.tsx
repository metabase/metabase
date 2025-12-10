import { useCallback, useMemo, useState } from "react";
import type { Route } from "react-router";
import { t } from "ttag";

import { useUpdateSegmentMutation } from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { useSelector } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { getMetadata } from "metabase/selectors/metadata";
import { Button, Flex, Group } from "metabase/ui";
import * as Lib from "metabase-lib";

import { SegmentEditor } from "../../components/SegmentEditor";
import { SegmentHeader } from "../../components/SegmentHeader";
import { useSegmentQuery } from "../../hooks/use-segment-query";
import { useExistingSegmentContext } from "../../layouts/SegmentLayout";
import { getPreviewUrl } from "../../utils/segment-query";

type SegmentDetailPageProps = {
  route: Route;
};

export function SegmentDetailPage({ route }: SegmentDetailPageProps) {
  const { segment, tabUrls, breadcrumbs, onRemove } =
    useExistingSegmentContext();
  const metadata = useSelector(getMetadata);
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
  const previewUrl = filters.length > 0 ? getPreviewUrl(definition) : undefined;

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
    <Flex
      direction="column"
      pos="relative"
      w="100%"
      h="100%"
      bg="bg-white"
      data-testid="segment-detail-page"
    >
      <SegmentHeader
        segment={segment}
        tabUrls={tabUrls}
        previewUrl={previewUrl}
        onRemove={onRemove}
        breadcrumbs={breadcrumbs}
        actions={
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
        onQueryChange={setQuery}
        onDescriptionChange={setDescription}
      />
      <LeaveRouteConfirmModal
        key={segment.id}
        route={route}
        isEnabled={isDirty && !isSaving}
      />
    </Flex>
  );
}
