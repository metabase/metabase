import { useMemo } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { PLUGIN_SNIPPET_FOLDERS } from "metabase/plugins";
import {
  ActionIcon,
  EntityNameCell,
  FixedSizeIcon,
  Tooltip,
  type TreeTableColumnDef,
} from "metabase/ui";
import type { TreeItem } from "metabase-enterprise/data-studio/common/types";
import {
  isCollection,
  isEmptyStateData,
} from "metabase-enterprise/data-studio/common/utils";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import type { CollectionItem } from "metabase-types/api";

type ColumnDefProps = {
  handleUnarchiveClick: (item: CollectionItem) => void;
};

export const useColumnDef = ({ handleUnarchiveClick }: ColumnDefProps) => {
  const remoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);

  return useMemo<TreeTableColumnDef<TreeItem>[]>(
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
        cell: ({ row }) => {
          const { data } = row.original;

          if (remoteSyncReadOnly || isEmptyStateData(data)) {
            return null;
          }

          if (isCollection(data)) {
            return <PLUGIN_SNIPPET_FOLDERS.CollectionMenu collection={data} />;
          }

          return (
            <Tooltip label={t`Unarchive snippet`}>
              <ActionIcon
                aria-label={t`Unarchive snippet`}
                size="md"
                onClick={async (event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  handleUnarchiveClick(data);
                }}
              >
                <FixedSizeIcon name={"unarchive"} c="text-primary" />
              </ActionIcon>
            </Tooltip>
          );
        },
      },
    ],
    [handleUnarchiveClick, remoteSyncReadOnly],
  );
};
