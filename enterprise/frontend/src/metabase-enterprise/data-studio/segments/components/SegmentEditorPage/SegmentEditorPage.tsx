import { useEffect, useMemo, useState } from "react";
import type { Route } from "react-router";
import { Link } from "react-router";
import { t } from "ttag";

import EditableText from "metabase/common/components/EditableText";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { SegmentEditorV2 } from "metabase/querying/segments";
import { getMetadata } from "metabase/selectors/metadata";
import {
  Anchor,
  Button,
  FixedSizeIcon,
  Group,
  Stack,
  Textarea,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type { DatasetQuery, Segment, Table } from "metabase-types/api";

import { SegmentMoreMenu } from "./SegmentMoreMenu";
import { SegmentPreview } from "./SegmentPreview";

const SEGMENT_NAME_MAX_LENGTH = 254;

type SegmentFormData = {
  name: string;
  description: string;
  definition: DatasetQuery;
};

type SegmentEditorPageProps = {
  segment?: Segment;
  table: Table;
  route: Route;
  isSaving: boolean;
  isRemoving?: boolean;
  onSave: (data: SegmentFormData) => void;
  onCancel: () => void;
  onRemove?: () => void;
  testId?: string;
};

export function SegmentEditorPage({
  segment,
  table,
  route,
  isSaving,
  isRemoving,
  onSave,
  onCancel,
  onRemove,
  testId,
}: SegmentEditorPageProps) {
  const metadata = useSelector(getMetadata);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [datasetQuery, setDatasetQuery] = useState<DatasetQuery | null>(null);

  const query = useMemo(() => {
    if (!datasetQuery?.database) {
      return undefined;
    }
    const metadataProvider = Lib.metadataProvider(
      datasetQuery.database,
      metadata,
    );
    return Lib.fromJsQuery(metadataProvider, datasetQuery);
  }, [metadata, datasetQuery]);

  const filters = useMemo(() => (query ? Lib.filters(query, -1) : []), [query]);

  useEffect(() => {
    if (segment) {
      setName(segment.name);
      setDescription(segment.description ?? "");
      setDatasetQuery(segment.definition);
    } else {
      const metadataProvider = Lib.metadataProvider(table.db_id, metadata);
      const tableMetadata = Lib.tableOrCardMetadata(metadataProvider, table.id);
      if (tableMetadata) {
        const initialQuery = Lib.queryFromTableOrCardMetadata(
          metadataProvider,
          tableMetadata,
        );
        setDatasetQuery(Lib.toJsQuery(initialQuery));
      }
    }
  }, [segment, table, metadata]);

  const isDirty = useMemo(() => {
    if (segment) {
      if (!datasetQuery) {
        return false;
      }
      const nameChanged = name !== segment.name;
      const descriptionChanged = description !== (segment.description ?? "");
      const queryChanged = !Lib.areLegacyQueriesEqual(
        datasetQuery,
        segment.definition,
      );
      return nameChanged || descriptionChanged || queryChanged;
    }
    return (
      name.trim().length > 0 || description.length > 0 || filters.length > 0
    );
  }, [segment, name, description, datasetQuery, filters]);

  const isNew = !segment;
  const hasName = name.trim().length > 0;
  const hasFilters = filters.length > 0;
  const isValid = hasName && hasFilters;
  const showButtons = isNew || isDirty;
  const canSave = showButtons && isValid && !isSaving;

  const handleChangeQuery = (newQuery: Lib.Query) => {
    setDatasetQuery(Lib.toJsQuery(newQuery));
  };

  const handleSave = () => {
    if (!datasetQuery || !isValid) {
      return;
    }
    onSave({
      name: name.trim(),
      description: description.trim(),
      definition: datasetQuery,
    });
  };

  const handleCancel = () => {
    if (segment) {
      setName(segment.name);
      setDescription(segment.description ?? "");
      setDatasetQuery(segment.definition);
    }
    onCancel();
  };

  const backUrl = Urls.dataStudioData({
    databaseId: table.db_id,
    schemaName: table.schema,
    tableId: table.id,
    tab: "segments",
  });

  return (
    <>
      <Stack
        pos="relative"
        w="100%"
        h="100%"
        bg="bg-white"
        px="xl"
        py="lg"
        gap="lg"
        data-testid={testId}
      >
        <Stack gap="sm" align="flex-start">
          <Anchor component={Link} to={backUrl} c="text-medium" fz="sm">
            <Group gap="xs">
              <FixedSizeIcon name="chevronleft" size={12} />
              {t`${table.display_name} segments`}
            </Group>
          </Anchor>
          <Group gap="xs" align="center">
            <EditableText
              initialValue={name}
              placeholder={t`New segment`}
              maxLength={SEGMENT_NAME_MAX_LENGTH}
              p={0}
              fw="bold"
              fz="h3"
              lh="h3"
              onContentChange={setName}
            />
            {segment && onRemove && <SegmentMoreMenu onRemove={onRemove} />}
          </Group>
        </Stack>
        <Stack flex={1} gap="lg">
          {query && (
            <SegmentEditorV2 query={query} onChange={handleChangeQuery} />
          )}
          <Group gap="lg" align="flex-start">
            <Textarea
              label={t`Description`}
              placeholder={t`Give it a description`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maw={400}
              flex={1}
            />
            {query && hasFilters && <SegmentPreview query={query} />}
          </Group>
          {showButtons && (
            <Group>
              <Button onClick={handleCancel}>{t`Cancel`}</Button>
              <Button
                variant="filled"
                disabled={!canSave}
                loading={isSaving}
                onClick={handleSave}
              >
                {t`Save`}
              </Button>
            </Group>
          )}
        </Stack>
      </Stack>
      <LeaveRouteConfirmModal
        key={segment?.id}
        route={route}
        isEnabled={isDirty && !isSaving && !isRemoving}
      />
    </>
  );
}
