import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useCreateSegmentMutation } from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { getMetadata } from "metabase/selectors/metadata";
import { Button, Flex } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { DatasetQuery, Segment, Table } from "metabase-types/api";

import { NewSegmentHeader } from "../../components/NewSegmentHeader";
import { SegmentEditor } from "../../components/SegmentEditor";
import { useSegmentQuery } from "../../hooks/use-segment-query";
import {
  createInitialQueryForTable,
  getPreviewUrl,
} from "../../utils/segment-query";

type NewSegmentPageProps = {
  route: Route;
  table: Table;
  breadcrumbs: ReactNode;
  getSuccessUrl: (segment: Segment) => string;
};

export function NewSegmentPage({
  route,
  table,
  breadcrumbs,
  getSuccessUrl,
}: NewSegmentPageProps) {
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
      setDefinition(createInitialQueryForTable(table, metadata));
    }
  }, [table, metadata]);

  const { query, filters } = useSegmentQuery(definition, metadata);

  const isDirty =
    name.trim().length > 0 || description.length > 0 || filters.length > 0;
  const isValid = name.trim().length > 0 && filters.length > 0;
  const previewUrl = filters.length > 0 ? getPreviewUrl(definition) : undefined;

  const setQuery = useCallback((newQuery: Lib.Query) => {
    setDefinition(Lib.toJsQuery(newQuery));
  }, []);

  const [createSegment, { isLoading: isSaving }] = useCreateSegmentMutation();

  const handleSave = useCallback(async () => {
    if (!table || !definition || !isValid) {
      return;
    }
    const { data: segment, error } = await createSegment({
      name: name.trim(),
      table_id: table.id,
      definition: definition,
      description: description.trim() || undefined,
    });

    if (error) {
      sendErrorToast(t`Failed to create segment`);
    } else if (segment) {
      sendSuccessToast(t`Segment created`);
      dispatch(push(getSuccessUrl(segment)));
    }
  }, [
    table,
    definition,
    name,
    description,
    isValid,
    createSegment,
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
      bg="background-primary"
      data-testid="new-segment-page"
    >
      <NewSegmentHeader
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
      <SegmentEditor
        query={query}
        description={description}
        onQueryChange={setQuery}
        onDescriptionChange={setDescription}
      />
      <LeaveRouteConfirmModal route={route} isEnabled={isDirty && !isSaving} />
    </Flex>
  );
}
