import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link/Link";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import {
  PaneHeader,
  type PaneHeaderProps,
} from "metabase/common/data-studio/components/PaneHeader";
import { useCollectionPath } from "metabase/common/data-studio/hooks/use-collection-path/useCollectionPath";
import { getLibraryCollectionDisplayName } from "metabase/data-studio/common/utils";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { Button, Icon } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

import { PublishTablesModal } from "../../../components/PublishTablesModal";
import { useLibraryCollections } from "../../../hooks/use-library-collections";
import { TableModal, type TableModalState } from "../TableModal";

import { TableMoreMenu } from "./TableMoreMenu";
import { TableNameInput } from "./TableNameInput";
import { TableTabs } from "./TableTabs";

type TableHeaderProps = {
  table: Table;
} & Omit<PaneHeaderProps, "breadcrumbs">;

export function TableHeader({ table, ...rest }: TableHeaderProps) {
  const [tableModal, setTableModal] = useState<TableModalState>();

  return (
    <>
      <PaneHeader
        data-testid="table-pane-header"
        title={<TableNameInput table={table} />}
        icon="table"
        menu={
          table.is_published && (
            <TableMoreMenu table={table} onOpenModal={setTableModal} />
          )
        }
        tabs={<TableTabs table={table} />}
        actions={!table.is_published && <PublishTableButton table={table} />}
        {...rest}
        breadcrumbs={
          table.is_published ? (
            <PublishedTableBreadcrumbs table={table} />
          ) : (
            <SuggestedTableBreadcrumbs table={table} />
          )
        }
      />
      <TableModal modal={tableModal} onClose={() => setTableModal(undefined)} />
    </>
  );
}

function PublishedTableBreadcrumbs({ table }: { table: Table }) {
  const { path, isLoadingPath } = useCollectionPath({
    collectionId: table.collection_id,
  });

  return (
    <DataStudioBreadcrumbs loading={isLoadingPath}>
      {path?.map((collection, i) => (
        <Link
          key={collection.id}
          to={Urls.dataStudioPublishedData({
            expandedIds: path.slice(1, i + 1).map((c) => c.id),
          })}
        >
          {getLibraryCollectionDisplayName(collection)}
        </Link>
      ))}
      <span>{table.display_name}</span>
    </DataStudioBreadcrumbs>
  );
}

function SuggestedTableBreadcrumbs({ table }: { table: Table }) {
  return (
    <DataStudioBreadcrumbs>
      <Link to={Urls.dataStudioPublishedData()}>{t`Published data`}</Link>
      <Link to={Urls.dataStudioSuggestedTables()}>{t`Suggested`}</Link>
      <span>{table.display_name}</span>
    </DataStudioBreadcrumbs>
  );
}

function PublishTableButton({ table }: { table: Table }) {
  const [isPublishModalOpen, { open: openPublishModal, close }] =
    useDisclosure(false);
  const { tableCollection } = useLibraryCollections();
  const isRemoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );

  if (!tableCollection?.can_write || isRemoteSyncReadOnly) {
    return null;
  }

  return (
    <>
      <Button
        variant="filled"
        leftSection={<Icon name="publish" />}
        onClick={openPublishModal}
      >
        {t`Publish`}
      </Button>
      {isPublishModalOpen && (
        <PublishTablesModal
          isOpened
          tableIds={[table.id]}
          onPublish={close}
          onClose={close}
        />
      )}
    </>
  );
}
