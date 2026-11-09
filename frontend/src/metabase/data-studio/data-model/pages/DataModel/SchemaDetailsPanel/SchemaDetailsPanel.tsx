import { type Ref, useMemo } from "react";
import { t } from "ttag";

import {
  useDiscardTablesFieldValuesMutation,
  useGetDatabaseQuery,
  useRescanTablesFieldValuesMutation,
  useSyncTablesSchemasMutation,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useMetadataToasts } from "metabase/common/hooks";
import { useNumberFormatter } from "metabase/common/hooks/use-number-formatter";
import {
  DATA_LAYER_VISIBILITY_ICONS,
  type DataLayer,
  getDataLayerVisibilityLabel,
} from "metabase/metadata/data-layers";
import {
  ActionIcon,
  Button,
  Code,
  Group,
  Icon,
  Menu,
  Select,
  Stack,
  Text,
} from "metabase/ui";
import type {
  Database,
  DatabaseId,
  SchemaId,
  SchemaName,
} from "metabase-types/api";

import {
  DETAILS_CELL_INPUT_CLASS_NAMES,
  DetailPanel,
  DetailPanelHeader,
  DetailsEditableText,
  SchemaDetailsSkeleton,
} from "../DetailPanel";
import { SegmentSettingsSection } from "../SegmentSettingsSection";
import { SemanticReviewSection } from "../SemanticReview";
import {
  getLastSyncedAt,
  getLastSyncedValue,
  getScheduleLabel,
  getTableStats,
} from "../sync-details";

interface SchemaDetailsPanelProps {
  ref?: Ref<HTMLDivElement>;
  databaseId: DatabaseId;
  schemaName: SchemaName;
  /** The schema's display name, or its raw name when it has none */
  displayName: string;
  onDisplayNameChange: (displayName: string) => void;
  defaultWidth: number;
  onWidthChange: (width: number) => void;
  /** The database's layers, in position order */
  dataLayers: DataLayer[];
  /** The layer this schema points at */
  dataLayer: DataLayer | undefined;
  onDataLayerChange: (layerId: string) => void;
  /** Opens the database drawer, where its layers are edited */
  onManageDataLayers: () => void;
  onClose: () => void;
}

/** The drawer panel for a schema: its names, stats, data layer, and syncing. */
export function SchemaDetailsPanel({
  ref,
  databaseId,
  schemaName,
  displayName,
  onDisplayNameChange,
  defaultWidth,
  onWidthChange,
  dataLayers,
  dataLayer,
  onDataLayerChange,
  onManageDataLayers,
  onClose,
}: SchemaDetailsPanelProps) {
  // The same request as the database drawer, so the two share a cache entry
  const {
    currentData: database,
    error,
    isFetching,
  } = useGetDatabaseQuery({ id: databaseId, include: "tables.fields" });
  const isLoading = isFetching && database == null;
  const schemaId: SchemaId = `${databaseId}:${schemaName}`;

  return (
    <DetailPanel
      ref={ref}
      defaultWidth={defaultWidth}
      onWidthChange={onWidthChange}
      data-testid="schema-section"
    >
      <DetailPanelHeader
        icon="folder"
        label={t`Schema`}
        title={displayName}
        actions={<SchemaActionsMenu schemaId={schemaId} />}
        onClose={onClose}
        data-testid="schema-section-header"
      />
      {error ? (
        <LoadingAndErrorWrapper error={error} />
      ) : isLoading || database == null ? (
        <SchemaDetailsSkeleton />
      ) : (
        <SchemaDetails
          database={database}
          schemaName={schemaName}
          displayName={displayName}
          onDisplayNameChange={onDisplayNameChange}
          dataLayers={dataLayers}
          dataLayer={dataLayer}
          onDataLayerChange={onDataLayerChange}
          onManageDataLayers={onManageDataLayers}
        />
      )}
    </DetailPanel>
  );
}

function SchemaActionsMenu({ schemaId }: { schemaId: SchemaId }) {
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const [syncTablesSchemas] = useSyncTablesSchemasMutation();
  const [rescanTablesFieldValues] = useRescanTablesFieldValuesMutation();
  const [discardTablesFieldValues] = useDiscardTablesFieldValuesMutation();
  const request = { schema_ids: [schemaId] };

  const handleSync = async () => {
    const { error } = await syncTablesSchemas(request);
    if (error) {
      sendErrorToast(getErrorMessage(error, t`Failed to start the sync`));
    } else {
      sendSuccessToast(t`Sync started`);
    }
  };

  const handleRescan = async () => {
    const { error } = await rescanTablesFieldValues(request);
    if (error) {
      sendErrorToast(getErrorMessage(error, t`Failed to start the scan`));
    } else {
      sendSuccessToast(t`Field values scan started`);
    }
  };

  const handleDiscard = async () => {
    const { error } = await discardTablesFieldValues(request);
    if (error) {
      sendErrorToast(getErrorMessage(error, t`Failed to discard values`));
    } else {
      sendSuccessToast(t`Discard triggered`);
    }
  };

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon aria-label={t`More actions`}>
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<Icon name="sync" />} onClick={handleSync}>
          {t`Re-sync schema`}
        </Menu.Item>
        <Menu.Item leftSection={<Icon name="list" />} onClick={handleRescan}>
          {t`Re-scan field values`}
        </Menu.Item>
        <Menu.Item leftSection={<Icon name="trash" />} onClick={handleDiscard}>
          {t`Discard cached field values`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

interface SchemaDetailsProps {
  database: Database;
  schemaName: SchemaName;
  dataLayers: DataLayer[];
  dataLayer: DataLayer | undefined;
  onDataLayerChange: (layerId: string) => void;
  displayName: string;
  onDisplayNameChange: (displayName: string) => void;
  onManageDataLayers: () => void;
}

function SchemaDetails({
  database,
  schemaName,
  dataLayers,
  dataLayer,
  onDataLayerChange,
  onManageDataLayers,
  displayName,
  onDisplayNameChange,
}: SchemaDetailsProps) {
  const formatNumber = useNumberFormatter({ maximumFractionDigits: 0 });
  const tables = useMemo(
    () =>
      (database.tables ?? []).filter((table) => table.schema === schemaName),
    [database.tables, schemaName],
  );
  const stats = useMemo(() => getTableStats(tables), [tables]);
  const lastSyncedAt = useMemo(() => getLastSyncedAt(tables), [tables]);

  const handleDataLayerChange = (value: string | null) => {
    if (value != null && dataLayers.some((layer) => layer.id === value)) {
      onDataLayerChange(value);
    }
  };

  const handleDisplayNameChange = (value: string) => {
    const nextDisplayName = value.trim();
    if (nextDisplayName !== displayName) {
      onDisplayNameChange(nextDisplayName);
    }
  };

  return (
    <Stack gap="xxl">
      <SidebarSection title={t`Metadata`}>
        <DetailsTable>
          <DetailsRow
            label={t`Display name`}
            fillValue
            value={
              <DetailsEditableText
                initialValue={displayName}
                // Clearing the name goes back to the raw name
                placeholder={schemaName}
                maxLength={254}
                isOptional
                onChange={handleDisplayNameChange}
                data-testid="schema-display-name-input"
              />
            }
          />
          <DetailsRow label={t`Raw name`} value={<Code>{schemaName}</Code>} />
          <DetailsRow label={t`Database`} value={database.name} />
        </DetailsTable>
      </SidebarSection>

      <SemanticReviewSection
        schema={{ db_id: database.id, schema: schemaName }}
      />

      <SidebarSection
        title={t`Data layer`}
        titleAside={
          <Button
            size="compact-md"
            variant="subtle"
            leftSection={<Icon name="gear" />}
            onClick={onManageDataLayers}
          >
            {t`Manage layers`}
          </Button>
        }
        description={t`Tables in this schema use this layer unless a table overrides it.`}
      >
        <DetailsTable>
          <DetailsRow
            label={t`Layer`}
            fillValue
            value={
              <Select
                aria-label={t`Data layer`}
                classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
                data={dataLayers.map((layer) => ({
                  value: layer.id,
                  label: layer.name,
                }))}
                value={dataLayer?.id ?? null}
                allowDeselect={false}
                onChange={handleDataLayerChange}
                data-testid="schema-data-layer-select"
              />
            }
          />
          {dataLayer && (
            <DetailsRow
              label={t`Visibility`}
              value={
                <Group gap="sm" wrap="nowrap">
                  <Icon
                    name={DATA_LAYER_VISIBILITY_ICONS[dataLayer.visibility]}
                    c="text-secondary"
                  />
                  <Text>
                    {getDataLayerVisibilityLabel(dataLayer.visibility)}
                  </Text>
                </Group>
              }
            />
          )}
        </DetailsTable>
      </SidebarSection>

      <SidebarSection title={t`Syncing`}>
        <DetailsTable>
          <DetailsRow
            label={t`Last synced`}
            value={getLastSyncedValue(database, lastSyncedAt)}
          />
          <DetailsRow
            label={t`Schedule`}
            value={getScheduleLabel(database.schedules?.metadata_sync)}
          />
        </DetailsTable>
      </SidebarSection>

      <SegmentSettingsSection
        databaseId={database.id}
        schemaName={schemaName}
      />

      <SidebarSection title={t`Stats`}>
        <DetailsTable>
          <DetailsRow label={t`Tables`} value={formatNumber(stats.tables)} />
          <DetailsRow label={t`Fields`} value={formatNumber(stats.fields)} />
          <DetailsRow
            label={t`Rows`}
            value={
              stats.rows != null
                ? formatNumber(stats.rows, { compact: true })
                : t`Unknown`
            }
          />
        </DetailsTable>
      </SidebarSection>
    </Stack>
  );
}
