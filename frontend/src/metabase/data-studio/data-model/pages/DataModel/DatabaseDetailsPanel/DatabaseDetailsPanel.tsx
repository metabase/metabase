import { type Ref, useMemo } from "react";
import { t } from "ttag";

import {
  tableApi,
  useGetDatabaseQuery,
  useRescanDatabaseFieldValuesMutation,
  useSyncDatabaseSchemaMutation,
  useUpdateDatabaseMutation,
} from "metabase/api";
import { listTag } from "metabase/api/tags";
import { getErrorMessage } from "metabase/api/utils";
import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useMetadataToasts } from "metabase/common/hooks";
import { useNumberFormatter } from "metabase/common/hooks/use-number-formatter";
import type { DataLayer } from "metabase/metadata/data-layers";
import { useDispatch } from "metabase/redux";
import { ActionIcon, Icon, Menu, Stack } from "metabase/ui";
import type { Database, DatabaseId } from "metabase-types/api";

import {
  DatabaseDetailsSkeleton,
  DetailPanel,
  DetailPanelHeader,
  DetailsEditableText,
} from "../DetailPanel";
import {
  getLastSyncedAt,
  getLastSyncedValue,
  getScheduleLabel,
  getTableStats,
} from "../sync-details";

import { DataLayersSection } from "./DataLayersSection";

const NAME_MAX_LENGTH = 254;

interface DatabaseDetailsPanelProps {
  ref?: Ref<HTMLDivElement>;
  databaseId: DatabaseId;
  defaultWidth: number;
  onWidthChange: (width: number) => void;
  dataLayers: DataLayer[];
  onDataLayersChange: (layers: DataLayer[]) => void;
  onClose: () => void;
}

/** The drawer panel for a database: name, description, data layers, syncing, and stats. */
export function DatabaseDetailsPanel({
  ref,
  databaseId,
  defaultWidth,
  onWidthChange,
  dataLayers,
  onDataLayersChange,
  onClose,
}: DatabaseDetailsPanelProps) {
  const {
    // `currentData` so switching databases shows the loading state
    currentData: database,
    error,
    isFetching,
  } = useGetDatabaseQuery({ id: databaseId, include: "tables.fields" });
  const isLoading = isFetching && database == null;

  return (
    <DetailPanel
      ref={ref}
      defaultWidth={defaultWidth}
      onWidthChange={onWidthChange}
      data-testid="database-section"
    >
      <DetailPanelHeader
        icon="database"
        label={t`Database`}
        title={database?.name}
        isLoading={isLoading}
        actions={database && <DatabaseActionsMenu databaseId={database.id} />}
        onClose={onClose}
        data-testid="database-section-header"
      />
      {error ? (
        <LoadingAndErrorWrapper error={error} />
      ) : database == null ? (
        <DatabaseDetailsSkeleton />
      ) : (
        <DatabaseDetails
          key={database.id}
          database={database}
          dataLayers={dataLayers}
          onDataLayersChange={onDataLayersChange}
        />
      )}
    </DetailPanel>
  );
}

function DatabaseActionsMenu({ databaseId }: { databaseId: DatabaseId }) {
  const dispatch = useDispatch();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const [syncDatabaseSchema] = useSyncDatabaseSchemaMutation();
  const [rescanFieldValues] = useRescanDatabaseFieldValuesMutation();

  const handleSync = async () => {
    const { error } = await syncDatabaseSchema(databaseId);
    if (error) {
      sendErrorToast(getErrorMessage(error, t`Failed to start the sync`));
    } else {
      dispatch(tableApi.util.invalidateTags([listTag("table")]));
      sendSuccessToast(t`Sync started`);
    }
  };

  const handleRescan = async () => {
    const { error } = await rescanFieldValues(databaseId);
    if (error) {
      sendErrorToast(getErrorMessage(error, t`Failed to start the scan`));
    } else {
      sendSuccessToast(t`Field values scan started`);
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
      </Menu.Dropdown>
    </Menu>
  );
}

function DatabaseDetails({
  database,
  dataLayers,
  onDataLayersChange,
}: {
  database: Database;
  dataLayers: DataLayer[];
  onDataLayersChange: (layers: DataLayer[]) => void;
}) {
  const formatNumber = useNumberFormatter({ maximumFractionDigits: 0 });
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const [updateDatabase] = useUpdateDatabaseMutation();

  const tables = useMemo(() => database.tables ?? [], [database.tables]);
  const stats = useMemo(() => getTableStats(tables), [tables]);
  const lastSyncedAt = useMemo(() => getLastSyncedAt(tables), [tables]);

  const handleNameChange = async (value: string) => {
    const name = value.trim();
    if (name.length === 0 || name === database.name) {
      return;
    }
    const { error } = await updateDatabase({ id: database.id, name });
    if (error) {
      sendErrorToast(t`Failed to update database name`);
    } else {
      sendSuccessToast(t`Database name updated`);
    }
  };

  const handleDescriptionChange = async (value: string) => {
    const description = value.trim();
    if (description === (database.description ?? "")) {
      return;
    }
    const { error } = await updateDatabase({ id: database.id, description });
    if (error) {
      sendErrorToast(t`Failed to update database description`);
    } else {
      sendSuccessToast(t`Database description updated`);
    }
  };

  return (
    <Stack gap="xxl">
      <SidebarSection title={t`Metadata`}>
        <DetailsTable>
          <DetailsRow
            label={t`Name`}
            value={
              <DetailsEditableText
                initialValue={database.name}
                placeholder={t`Give this database a name`}
                maxLength={NAME_MAX_LENGTH}
                fw="bold"
                onChange={handleNameChange}
                data-testid="database-name-input"
              />
            }
          />
          <DetailsRow
            label={t`Description`}
            value={
              <DetailsEditableText
                initialValue={database.description}
                placeholder={t`No description`}
                isMultiline
                isOptional
                onChange={handleDescriptionChange}
                data-testid="database-description-input"
              />
            }
          />
        </DetailsTable>
      </SidebarSection>

      <DataLayersSection layers={dataLayers} onChange={onDataLayersChange} />

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

      <SidebarSection title={t`Stats`}>
        <DetailsTable>
          <DetailsRow label={t`Schemas`} value={formatNumber(stats.schemas)} />
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
