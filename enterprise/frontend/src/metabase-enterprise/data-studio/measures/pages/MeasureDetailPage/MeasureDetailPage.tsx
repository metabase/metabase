import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import type { Route } from "react-router";
import { t } from "ttag";

import { useUpdateMeasureMutation } from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { useSelector } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { getMetadata } from "metabase/selectors/metadata";
import { Button, Flex, Group } from "metabase/ui";
import { getDatasetQueryPreviewUrl } from "metabase-enterprise/data-studio/common/utils/get-dataset-query-preview-url";
import * as Lib from "metabase-lib";
import type { DatasetQuery, Measure } from "metabase-types/api";

import { MeasureEditor } from "../../components/MeasureEditor";
import { MeasureHeader } from "../../components/MeasureHeader";
import type { MeasureTabUrls } from "../../types";

type MeasureDetailPageProps = {
  route: Route;
  measure: Measure;
  tabUrls: MeasureTabUrls;
  breadcrumbs: ReactNode;
  onRemove: () => Promise<void>;
};

export function MeasureDetailPage({
  route,
  measure,
  tabUrls,
  breadcrumbs,
  onRemove,
}: MeasureDetailPageProps) {
  const metadata = useSelector(getMetadata);
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const [description, setDescription] = useState(measure.description ?? "");
  const [definition, setDefinition] = useState<DatasetQuery>(
    measure.definition,
  );
  const [savedMeasure, setSavedMeasure] = useState(measure);

  const query = useMemo(() => {
    if (!definition?.database) {
      return undefined;
    }
    const metadataProvider = Lib.metadataProvider(
      definition.database,
      metadata,
    );
    return Lib.fromJsQuery(metadataProvider, definition);
  }, [metadata, definition]);

  const aggregations = useMemo(
    () => (query ? Lib.aggregations(query, -1) : []),
    [query],
  );

  const isDirty = useMemo(
    () =>
      description !== (savedMeasure.description ?? "") ||
      !Lib.areLegacyQueriesEqual(definition, savedMeasure.definition),
    [description, definition, savedMeasure],
  );

  const isValid = aggregations.length === 1;
  const previewUrl = isValid
    ? getDatasetQueryPreviewUrl(definition)
    : undefined;

  const setQuery = useCallback((newQuery: Lib.Query) => {
    setDefinition(Lib.toJsQuery(newQuery));
  }, []);

  const [updateMeasure, { isLoading: isSaving }] = useUpdateMeasureMutation();

  const handleSave = useCallback(async () => {
    if (!isValid) {
      return;
    }
    const { error } = await updateMeasure({
      id: measure.id,
      name: measure.name,
      description: description.trim() || undefined,
      definition: definition,
      revision_message: t`Updated from Data Studio`,
    });

    if (error) {
      sendErrorToast(t`Failed to update measure`);
    } else {
      setSavedMeasure({ ...measure, description, definition });
      sendSuccessToast(t`Measure updated`);
    }
  }, [
    measure,
    definition,
    description,
    isValid,
    updateMeasure,
    sendSuccessToast,
    sendErrorToast,
  ]);

  const handleReset = useCallback(() => {
    setDescription(savedMeasure.description ?? "");
    setDefinition(savedMeasure.definition);
  }, [savedMeasure]);

  return (
    <Flex
      direction="column"
      pos="relative"
      w="100%"
      h="100%"
      bg="bg-white"
      data-testid="measure-detail-page"
    >
      <MeasureHeader
        measure={measure}
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
      {query && (
        <MeasureEditor
          query={query}
          description={description}
          onQueryChange={setQuery}
          onDescriptionChange={setDescription}
        />
      )}
      <LeaveRouteConfirmModal
        key={measure.id}
        route={route}
        isEnabled={isDirty && !isSaving}
      />
    </Flex>
  );
}
