import { useEffect, useMemo, useState } from "react";
import type { Route } from "react-router";
import { Link } from "react-router";
import { t } from "ttag";

import EditableText from "metabase/common/components/EditableText";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { MeasureEditorV2 } from "metabase/querying/measures";
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
import type { DatasetQuery, Measure, Table } from "metabase-types/api";

import { MeasureMoreMenu } from "./MeasureMoreMenu";
import { MeasurePreview } from "./MeasurePreview";

const MEASURE_NAME_MAX_LENGTH = 254;

type MeasureFormData = {
  name: string;
  description: string;
  definition: DatasetQuery;
};

type MeasureEditorPageProps = {
  measure?: Measure;
  table: Table;
  route: Route;
  isSaving: boolean;
  isRemoving?: boolean;
  onSave: (data: MeasureFormData) => void;
  onCancel?: () => void;
  onRemove?: () => void;
  testId?: string;
};

export function MeasureEditorPage({
  measure,
  table,
  route,
  isSaving,
  isRemoving,
  onSave,
  onCancel,
  onRemove,
  testId,
}: MeasureEditorPageProps) {
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

  const aggregations = useMemo(
    () => (query ? Lib.aggregations(query, -1) : []),
    [query],
  );

  useEffect(() => {
    if (measure) {
      setName(measure.name);
      setDescription(measure.description ?? "");
      setDatasetQuery(measure.definition);
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
  }, [measure, table, metadata]);

  const isDirty = useMemo(() => {
    if (measure) {
      if (!datasetQuery) {
        return false;
      }
      const nameChanged = name !== measure.name;
      const descriptionChanged = description !== (measure.description ?? "");
      const queryChanged = !Lib.areLegacyQueriesEqual(
        datasetQuery,
        measure.definition,
      );
      return nameChanged || descriptionChanged || queryChanged;
    }
    return (
      name.trim().length > 0 ||
      description.length > 0 ||
      aggregations.length > 0
    );
  }, [measure, name, description, datasetQuery, aggregations]);

  const isNew = !measure;
  const hasName = name.trim().length > 0;
  const hasAggregation = aggregations.length === 1;
  const isValid = hasName && hasAggregation;
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
    if (measure) {
      setName(measure.name);
      setDescription(measure.description ?? "");
      setDatasetQuery(measure.definition);
    }
    onCancel?.();
  };

  const backUrl = Urls.dataStudioData({
    databaseId: table.db_id,
    schemaName: table.schema,
    tableId: table.id,
    tab: "measures",
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
              {t`${table.display_name} measures`}
            </Group>
          </Anchor>
          <Group gap="xs" align="center">
            <EditableText
              initialValue={name}
              placeholder={t`New measure`}
              maxLength={MEASURE_NAME_MAX_LENGTH}
              p={0}
              fw="bold"
              fz="h3"
              lh="h3"
              onContentChange={setName}
            />
            {measure && onRemove && <MeasureMoreMenu onRemove={onRemove} />}
          </Group>
        </Stack>
        <Stack flex={1} gap="lg">
          {query && (
            <MeasureEditorV2 query={query} onChange={handleChangeQuery} />
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
            {query && hasAggregation && <MeasurePreview query={query} />}
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
        key={measure?.id}
        route={route}
        isEnabled={isDirty && !isSaving && !isRemoving}
      />
    </>
  );
}
