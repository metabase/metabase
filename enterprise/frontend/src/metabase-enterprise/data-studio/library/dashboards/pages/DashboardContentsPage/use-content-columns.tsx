import { useMemo } from "react";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { getTranslatedEntityName } from "metabase/common/utils/model-names";
import { useGetIcon } from "metabase/hooks/use-icon";
import { EntityNameCell, type TreeTableColumnDef } from "metabase/ui";
import type { Card, Dashboard } from "metabase-types/api";

import { ContentLocationCell } from "./ContentLocationCell";
import { CARD_TYPE_MODEL } from "./constants";

export function useContentColumns(
  dashboard: Pick<Dashboard, "id" | "name">,
): TreeTableColumnDef<Card>[] {
  const getIcon = useGetIcon();

  return useMemo(
    () => [
      {
        id: "name",
        header: t`Name`,
        accessorKey: "name",
        enableSorting: true,
        minWidth: 200,
        cell: ({ row }) => (
          <EntityNameCell
            data-testid="dashboard-content-name"
            icon={
              getIcon({
                model: CARD_TYPE_MODEL[row.original.type],
                display: row.original.display,
              }).name
            }
            name={row.original.name}
          />
        ),
      },
      {
        id: "type",
        header: t`Type`,
        accessorKey: "type",
        enableSorting: true,
        width: "auto",
        widthPadding: 20,
        cell: ({ row }) =>
          getTranslatedEntityName(CARD_TYPE_MODEL[row.original.type]),
      },
      {
        id: "location",
        header: t`Location`,
        minWidth: 160,
        cell: ({ row }) => (
          <ContentLocationCell item={row.original} dashboard={dashboard} />
        ),
      },
      {
        id: "updatedAt",
        header: t`Last edited at`,
        accessorKey: "updated_at",
        enableSorting: true,
        sortingFn: "datetime",
        width: "auto",
        widthPadding: 20,
        cell: ({ row }) => <DateTime value={row.original.updated_at} />,
      },
    ],
    [dashboard, getIcon],
  );
}
