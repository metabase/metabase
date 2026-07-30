import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import {
  Ellipsified,
  FixedSizeIcon,
  Group,
  Text,
  type TreeTableColumnDef,
} from "metabase/ui";
import type { ContentDiagnosticsBaseFinding } from "metabase-types/api";

import {
  getCollectionName,
  getEntityIcon,
  getEntityName,
  getEntityTypeLabel,
  getUserName,
} from "./utils";

export function getCommonColumns<
  T extends ContentDiagnosticsBaseFinding,
>(): TreeTableColumnDef<T>[] {
  return [
    {
      id: "name",
      header: t`Name`,
      enableSorting: true,
      sortDescFirst: false,
      minWidth: "auto",
      maxAutoWidth: 520,
      accessorFn: getEntityName,
      cell: ({ row }) => {
        const finding = row.original;
        return (
          <Group align="center" gap="sm" miw={0} wrap="nowrap">
            <FixedSizeIcon name={getEntityIcon(finding)} />
            <Ellipsified tooltipProps={{ openDelay: 300 }}>
              {getEntityName(finding)}
            </Ellipsified>
          </Group>
        );
      },
    },
    {
      id: "entity-type",
      header: t`Type`,
      enableSorting: true,
      sortDescFirst: false,
      width: "auto",
      minWidth: 100,
      accessorFn: (finding) => getEntityTypeLabel(finding),
    },
    {
      id: "collection",
      header: t`Collection`,
      enableSorting: false,
      width: "auto",
      minWidth: 120,
      maxAutoWidth: 520,
      accessorFn: (finding) => getCollectionName(finding.details.collection),
      cell: ({ row }) => {
        const collectionName = getCollectionName(
          row.original.details.collection,
        );
        return (
          <Group align="center" gap="sm" miw={0} wrap="nowrap">
            <FixedSizeIcon name="folder" />
            <Ellipsified tooltipProps={{ openDelay: 300 }}>
              {collectionName}
            </Ellipsified>
          </Group>
        );
      },
    },
    {
      id: "created-by",
      header: t`Created by`,
      enableSorting: true,
      sortDescFirst: false,
      width: "auto",
      minWidth: 120,
      accessorFn: (finding) => getUserName(finding.details.creator),
      cell: ({ row }) => (
        <Ellipsified tooltipProps={{ openDelay: 300 }}>
          {getUserName(row.original.details.creator)}
        </Ellipsified>
      ),
    },
    {
      id: "created-at",
      header: t`Created at`,
      enableSorting: true,
      sortDescFirst: false,
      width: "auto",
      minWidth: 150,
      accessorFn: (finding) => finding.created_at,
      cell: ({ row }) => {
        const { created_at } = row.original;
        return created_at != null ? (
          <Ellipsified tooltipProps={{ openDelay: 300 }}>
            <DateTime value={created_at} unit="day" />
          </Ellipsified>
        ) : (
          <Text c="text-secondary">{"—"}</Text>
        );
      },
    },
  ];
}
