import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import {
  Ellipsified,
  FixedSizeIcon,
  Group,
  Text,
  type TreeTableColumnDef,
} from "metabase/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import type { ContentDiagnosticsBaseFinding } from "metabase-types/api";

import { TOOLTIP_OPEN_DELAY_MS } from "./constants";
import {
  getCollectionName,
  getEntityIcon,
  getEntityName,
  getEntityTypeLabel,
  getUserName,
} from "./utils";

type CommonColumns<T extends ContentDiagnosticsBaseFinding> = Record<
  "name" | "entityType" | "collectionName" | "createdBy" | "createdAt",
  TreeTableColumnDef<T>
>;

export function getCommonColumns<
  T extends ContentDiagnosticsBaseFinding,
>(): CommonColumns<T> {
  return {
    name: {
      id: "name",
      header: t`Name`,
      enableSorting: true,
      sortDescFirst: false,
      minWidth: "auto",
      maxAutoWidth: 520,
      accessorFn: getEntityName,
      cell: ({ row }) => (
        <Ellipsified tooltipProps={{ openDelay: TOOLTIP_OPEN_DELAY_MS }}>
          {getEntityName(row.original)}
        </Ellipsified>
      ),
    },
    entityType: {
      id: "entity-type",
      header: t`Type`,
      enableSorting: true,
      sortDescFirst: false,
      width: "auto",
      accessorFn: (finding) => getEntityTypeLabel(finding),
      // Icon-only: the backend sorts by entity type regardless of locale, so
      // the column must not display a translated label (GDGT-3309).
      cell: ({ row }) => (
        <FixedSizeIcon
          name={getEntityIcon(row.original)}
          aria-label={getEntityTypeLabel(row.original)}
          mx="auto"
        />
      ),
    },
    collectionName: {
      id: "collection-name",
      header: t`Location`,
      enableSorting: true,
      sortDescFirst: false,
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
            <Ellipsified tooltipProps={{ openDelay: TOOLTIP_OPEN_DELAY_MS }}>
              {collectionName}
            </Ellipsified>
          </Group>
        );
      },
    },
    createdBy: {
      id: "created-by",
      header: t`Created by`,
      enableSorting: true,
      sortDescFirst: false,
      width: "auto",
      minWidth: 120,
      accessorFn: (finding) => getUserName(finding.details.creator),
      cell: ({ row }) => (
        <Ellipsified tooltipProps={{ openDelay: TOOLTIP_OPEN_DELAY_MS }}>
          {getUserName(row.original.details.creator)}
        </Ellipsified>
      ),
    },
    createdAt: {
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
          <Ellipsified tooltipProps={{ openDelay: TOOLTIP_OPEN_DELAY_MS }}>
            <DateTime value={created_at} unit="day" />
          </Ellipsified>
        ) : (
          <Text c="text-secondary">{EMPTY_CELL_PLACEHOLDER}</Text>
        );
      },
    },
  };
}
