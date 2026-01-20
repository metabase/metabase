import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import type { Route } from "react-router";
import { t } from "ttag";

import { useUpdateMeasureMutation } from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { useSelector } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { getMetadata } from "metabase/selectors/metadata";
import { getUserCanWriteMeasures } from "metabase/selectors/user";
import { Button, Group } from "metabase/ui";
import { PageContainer } from "metabase-enterprise/data-studio/common/components/PageContainer";
import { getDatasetQueryPreviewUrl } from "metabase-enterprise/data-studio/common/utils/get-dataset-query-preview-url";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import * as Lib from "metabase-lib";
import type { Measure } from "metabase-types/api";

import { MeasureEditor } from "../../components/MeasureEditor";
import { MeasureHeader } from "../../components/MeasureHeader";
import { useMeasureQuery } from "../../hooks/use-measure-query";
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
  const canWriteMeasures = useSelector(getUserCanWriteMeasures);
  const metadata = useSelector(getMetadata);
  const remoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const canEditMeasures = canWriteMeasures && !remoteSyncReadOnly;

  const [description, setDescription] = useState(measure.description ?? "");
  const [definition, setDefinition] = useState(measure.definition);
  const [savedMeasure, setSavedMeasure] = useState(measure);

  const { query, aggregations } = useMeasureQuery(definition, metadata);

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
    <PageContainer data-testid="measure-detail-page">
      <MeasureHeader
        measure={measure}
        tabUrls={tabUrls}
        previewUrl={previewUrl}
        onRemove={canEditMeasures ? onRemove : undefined}
        breadcrumbs={breadcrumbs}
        actions={
          canEditMeasures &&
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
        readOnly={!canEditMeasures}
      />
      <MeasureEditor
        query={query}
        description={description}
        onQueryChange={setQuery}
        onDescriptionChange={setDescription}
        readOnly={!canEditMeasures}
      />
      {canEditMeasures && (
        <LeaveRouteConfirmModal
          key={measure.id}
          route={route}
          isEnabled={isDirty && !isSaving}
        />
      )}
    </PageContainer>
  );
}
