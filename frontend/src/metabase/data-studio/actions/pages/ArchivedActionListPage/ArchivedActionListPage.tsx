import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { useUpdateActionMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { UnarchiveCollectionButton } from "metabase/common/collections/components/UnarchiveCollectionButton";
import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { useMetadataToasts } from "metabase/common/hooks";
import { SectionLayout } from "metabase/data-studio/app/components/SectionLayout";
import type { TreeItem } from "metabase/data-studio/common/types";
import {
  isCollectionData,
  isEmptyStateData,
} from "metabase/data-studio/common/utils";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import {
  ActionIcon,
  Card,
  Center,
  EntityNameCell,
  FixedSizeIcon,
  Icon,
  Stack,
  TextInput,
  Tooltip,
  TreeTable,
  type TreeTableColumnDef,
  useTreeTableInstance,
} from "metabase/ui";
import * as Urls from "metabase/urls";

import { useBuildActionTree } from "../../hooks/use-build-action-tree";

export function ArchivedActionListPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const { tree, isLoading, error } = useBuildActionTree({ archived: true });
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const [updateAction] = useUpdateActionMutation();
  const remoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );

  const handleUnarchive = useCallback(
    async ({ id, name }: { id: number; name: string }) => {
      try {
        await updateAction({ id, archived: false }).unwrap();
        sendSuccessToast(t`"${name}" unarchived`);
      } catch (error) {
        sendErrorToast(getErrorMessage(error, t`Failed to unarchive action`));
      }
    },
    [sendErrorToast, sendSuccessToast, updateAction],
  );

  const columns = useMemo<TreeTableColumnDef<TreeItem>[]>(
    () => [
      {
        id: "name",
        header: t`Name`,
        enableSorting: true,
        accessorKey: "name",
        minWidth: 200,
        cell: ({ row }) => (
          <EntityNameCell
            data-testid={`${row.original.model}-name`}
            icon={row.original.icon}
            name={row.original.name}
          />
        ),
      },
      {
        id: "actions",
        width: 48,
        cell: ({ row }) => (
          <ArchivedItemMenu
            treeItem={row.original}
            readOnly={remoteSyncReadOnly}
            onUnarchive={handleUnarchive}
          />
        ),
      },
    ],
    [handleUnarchive, remoteSyncReadOnly],
  );

  const treeTableInstance = useTreeTableInstance({
    data: tree,
    columns,
    getSubRows: (node) => node.children,
    getNodeId: (node) => node.id,
    globalFilter: searchQuery,
    onGlobalFilterChange: setSearchQuery,
    defaultExpanded: true,
  });

  if (isLoading || error) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <SectionLayout>
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>
            <Link to={Urls.dataStudioActions()}>{t`Data actions`}</Link>
            {t`Archived actions`}
          </DataStudioBreadcrumbs>
        }
        px="3.5rem"
        py={0}
      />
      <Stack
        bg="background_page-secondary"
        data-testid="archived-actions-page"
        pb="2rem"
        px="3.5rem"
        style={{ overflow: "hidden" }}
      >
        <TextInput
          placeholder={t`Search...`}
          leftSection={<Icon name="search" />}
          bdrs="sm"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <Card withBorder p={0}>
          <TreeTable
            instance={treeTableInstance}
            emptyState={t`No archived actions`}
            onRowClick={(row) => {
              if (row.getCanExpand()) {
                row.toggleExpanded();
              }
            }}
            renderRowLink={(row, props) => {
              const { data } = row.original;
              return data.model === "action" ? (
                <Link to={Urls.dataStudioAction(Number(data.id))} {...props} />
              ) : (
                props.children
              );
            }}
          />
        </Card>
      </Stack>
    </SectionLayout>
  );
}

type ArchivedItemMenuProps = {
  treeItem: TreeItem;
  readOnly: boolean;
  onUnarchive: (item: { id: number; name: string }) => void;
};

function ArchivedItemMenu({
  treeItem,
  readOnly,
  onUnarchive,
}: ArchivedItemMenuProps) {
  const { data } = treeItem;

  if (readOnly || isEmptyStateData(data)) {
    return null;
  }

  if (isCollectionData(data)) {
    return <UnarchiveCollectionButton collection={data} />;
  }

  return (
    <Tooltip label={t`Unarchive action`}>
      <ActionIcon
        aria-label={t`Unarchive action`}
        size="md"
        onClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
          onUnarchive({ id: Number(data.id), name: data.name });
        }}
      >
        <FixedSizeIcon name="unarchive" c="text-primary" />
      </ActionIcon>
    </Tooltip>
  );
}
