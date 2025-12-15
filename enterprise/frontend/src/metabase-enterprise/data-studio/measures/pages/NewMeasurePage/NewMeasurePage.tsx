import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useCreateMeasureMutation } from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { getMetadata } from "metabase/selectors/metadata";
import { Button, Flex } from "metabase/ui";
import { getDatasetQueryPreviewUrl } from "metabase-enterprise/data-studio/common/utils/get-dataset-query-preview-url";
import * as Lib from "metabase-lib";
import type { DatasetQuery, Measure, Table } from "metabase-types/api";

import { MeasureEditor } from "../../components/MeasureEditor";
import { NewMeasureHeader } from "../../components/NewMeasureHeader";

type NewMeasurePageProps = {
  route: Route;
  table: Table;
  breadcrumbs: ReactNode;
  getSuccessUrl: (measure: Measure) => string;
};

export function NewMeasurePage({
  route,
  table,
  breadcrumbs,
  getSuccessUrl,
}: NewMeasurePageProps) {
  const dispatch = useDispatch();
  const metadata = useSelector(getMetadata);
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [definition, setDefinition] = useState<DatasetQuery | null>(null);

  const isInitialized = useRef(false);

  useEffect(() => {
    if (table && !isInitialized.current) {
      isInitialized.current = true;
      const metadataProvider = Lib.metadataProvider(table.db_id, metadata);
      const tableMetadata = Lib.tableOrCardMetadata(metadataProvider, table.id);
      if (tableMetadata) {
        const initialQuery = Lib.queryFromTableOrCardMetadata(
          metadataProvider,
          tableMetadata,
        );
        setDefinition(Lib.toJsQuery(initialQuery));
      }
    }
  }, [table, metadata]);

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

  const isDirty =
    name.trim().length > 0 || description.length > 0 || aggregations.length > 0;
  const isValid = name.trim().length > 0 && aggregations.length === 1;
  const previewUrl =
    aggregations.length === 1
      ? getDatasetQueryPreviewUrl(definition)
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
      name: name.trim(),
      table_id: table.id,
      definition: definition,
      description: description.trim() || undefined,
    });

    if (error) {
      sendErrorToast(t`Failed to create measure`);
    } else if (measure) {
      sendSuccessToast(t`Measure created`);
      dispatch(push(getSuccessUrl(measure)));
    }
  }, [
    table,
    definition,
    name,
    description,
    isValid,
    createMeasure,
    dispatch,
    getSuccessUrl,
    sendSuccessToast,
    sendErrorToast,
  ]);

  return (
    <Flex
      direction="column"
      pos="relative"
      w="100%"
      h="100%"
      bg="bg-white"
      data-testid="new-measure-page"
    >
      <NewMeasureHeader
        previewUrl={previewUrl}
        onNameChange={setName}
        breadcrumbs={breadcrumbs}
        actions={
          isDirty && (
            <Button
              variant="filled"
              disabled={!isValid}
              loading={isSaving}
              onClick={handleSave}
            >
              {t`Save`}
            </Button>
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
      <LeaveRouteConfirmModal route={route} isEnabled={isDirty && !isSaving} />
    </Flex>
  );
}
