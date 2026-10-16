import { useMemo } from "react";
import { t } from "ttag";

import { getEntityTypeFromCardType } from "metabase/common/collections/utils";
import { DateTime } from "metabase/common/components/DateTime";
import { getTranslatedEntityName } from "metabase/common/utils/model-names";
import { useGetIcon } from "metabase/hooks/use-icon";
import { EntityNameCell, type TreeTableColumnDef } from "metabase/ui";
import { isReadableCard } from "metabase-types/guards/card";

import { ContentLocationCell } from "./ContentLocationCell";
import { UnreadableNameCell } from "./UnreadableNameCell";
import type { ContentItem, ContentOwner } from "./types";

export function useContentColumns(
  owner: ContentOwner,
): TreeTableColumnDef<ContentItem>[] {
  const getIcon = useGetIcon();

  return useMemo<TreeTableColumnDef<ContentItem>[]>(
    () => [
      {
        id: "name",
        header: t`Name`,
        accessorFn: (item) => (isReadableCard(item) ? item.name : undefined),
        enableSorting: true,
        sortUndefined: "last",
        minWidth: 200,
        cell: ({ row }) =>
          isReadableCard(row.original) ? (
            <EntityNameCell
              data-testid="content-name"
              icon={
                getIcon({
                  model: getEntityTypeFromCardType(row.original.type),
                  display: row.original.display,
                }).name
              }
              name={row.original.name}
            />
          ) : (
            <UnreadableNameCell />
          ),
      },
      {
        id: "type",
        header: t`Type`,
        accessorFn: (item) => (isReadableCard(item) ? item.type : undefined),
        enableSorting: true,
        sortUndefined: "last",
        width: "auto",
        widthPadding: 20,
        cell: ({ row }) =>
          isReadableCard(row.original)
            ? getTranslatedEntityName(
                getEntityTypeFromCardType(row.original.type),
              )
            : null,
      },
      {
        id: "location",
        header: t`Location`,
        minWidth: 160,
        cell: ({ row }) =>
          isReadableCard(row.original) ? (
            <ContentLocationCell item={row.original} owner={owner} />
          ) : null,
      },
      {
        id: "updatedAt",
        header: t`Last edited at`,
        accessorFn: (item) =>
          isReadableCard(item) ? item.updated_at : undefined,
        enableSorting: true,
        sortingFn: "datetime",
        sortUndefined: "last",
        width: "auto",
        widthPadding: 20,
        cell: ({ row }) =>
          isReadableCard(row.original) ? (
            <DateTime value={row.original.updated_at} />
          ) : null,
      },
    ],
    [owner, getIcon],
  );
}
