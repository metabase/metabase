import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import {
  Ellipsified,
  FixedSizeIcon,
  Group,
  Text,
  type TreeTableColumnDef,
} from "metabase/ui";
import type { ContentDiagnosticsFinding } from "metabase-types/api";

import {
  getCollectionPath,
  getEntityIcon,
  getEntityName,
  getEntityTypeLabel,
  getUserName,
} from "../utils";

export function getColumns(): TreeTableColumnDef<ContentDiagnosticsFinding>[] {
  return [
    {
      id: "name",
      header: t`Name`,
      enableSorting: true,
      sortDescFirst: false,
      width: "auto",
      minWidth: 160,
      maxAutoWidth: 520,
      accessorFn: getEntityName,
      cell: ({ row }) => {
        const finding = row.original;
        return (
          <Group align="center" gap="sm" miw={0} wrap="nowrap">
            <FixedSizeIcon name={getEntityIcon(finding.entity_type)} />
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
      accessorFn: (finding) => getEntityTypeLabel(finding.entity_type),
    },
    {
      id: "collection",
      header: t`Collection`,
      enableSorting: false,
      width: "auto",
      minWidth: 120,
      maxAutoWidth: 520,
      accessorFn: (finding) => getCollectionPath(finding.details.collection),
      cell: ({ row }) => {
        const path = getCollectionPath(row.original.details.collection);
        return (
          <Group align="center" gap="sm" miw={0} wrap="nowrap">
            <FixedSizeIcon name="folder" />
            <Ellipsified tooltipProps={{ openDelay: 300 }}>{path}</Ellipsified>
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
    },
    {
      id: "created-at",
      header: t`Created at`,
      enableSorting: true,
      sortDescFirst: false,
      width: "auto",
      minWidth: 120,
      accessorFn: (finding) => finding.created_at,
      cell: ({ row }) => {
        const { created_at } = row.original;
        return created_at != null ? (
          <DateTime value={created_at} unit="day" />
        ) : (
          <Text c="text-secondary">{"—"}</Text>
        );
      },
    },
    {
      id: "last-active-at",
      header: t`Last active`,
      enableSorting: true,
      sortDescFirst: false,
      width: "auto",
      minWidth: 120,
      accessorFn: (finding) => finding.last_active_at,
      cell: ({ row }) => {
        const { last_active_at } = row.original;
        if (last_active_at == null) {
          return <Text c="text-secondary">{t`Never`}</Text>;
        }
        return <DateTime value={last_active_at} unit="day" />;
      },
    },
  ];
}

export const COLUMN_WIDTHS = [0.28, 0.12, 0.24, 0.13, 0.12, 0.11];
