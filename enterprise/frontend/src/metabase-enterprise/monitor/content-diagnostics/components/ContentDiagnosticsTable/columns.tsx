import { t } from "ttag";

import {
  Ellipsified,
  FixedSizeIcon,
  Group,
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
  ];
}

export const COLUMN_WIDTHS = [0.4, 0.15, 0.3, 0.15];
