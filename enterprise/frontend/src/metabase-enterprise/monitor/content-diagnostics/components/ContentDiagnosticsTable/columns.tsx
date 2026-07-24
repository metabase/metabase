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
      id: "type",
      header: t`Type`,
      width: "auto",
      minWidth: 100,
      accessorFn: (finding) => getEntityTypeLabel(finding.entity_type),
    },
    {
      id: "collection",
      header: t`Collection`,
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
      id: "creator",
      header: t`Created by`,
      width: "auto",
      minWidth: 120,
      accessorFn: (finding) => getUserName(finding.details.creator),
    },
    {
      id: "last_active_at",
      header: t`Last active`,
      width: "auto",
      minWidth: 120,
      accessorFn: (finding) => finding.last_active_at,
      cell: ({ row }) => {
        const { last_active_at } = row.original;
        // A null anchor means the entity was never used/ran — the maximally
        // stale case, so surface it explicitly rather than as an empty cell.
        if (last_active_at == null) {
          return <Text c="text-secondary">{t`Never`}</Text>;
        }
        return <DateTime value={last_active_at} unit="day" />;
      },
    },
  ];
}

export const COLUMN_WIDTHS = [0.3, 0.13, 0.27, 0.15, 0.15];
