import { useMemo } from "react";
import { t } from "ttag";

import { useListTableIndexesQuery } from "metabase/api";
import { ForwardRefLink } from "metabase/common/components/Link";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import {
  Button,
  Card,
  Code,
  Ellipsified,
  Group,
  Icon,
  Stack,
  TreeTable,
  type TreeTableColumnDef,
  useTreeTableInstance,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import type { TableIndexEntry, TransformId } from "metabase-types/api";

// TreeTable rows need a stable `id`. A managed index uses its `request` id; a
// warehouse index Metabase doesn't manage carries none, so derive one from its
// observed identity.
type IndexRow = TableIndexEntry & { id: string };

function getRowId(index: TableIndexEntry): string {
  if (index.request) {
    return String(index.request.id);
  }
  return `warehouse:${index.name ?? index.kind}:${index.key_columns.join(",")}`;
}

function getColumns(): TreeTableColumnDef<IndexRow>[] {
  return [
    {
      id: "name",
      header: t`Name`,
      minWidth: "auto",
      maxAutoWidth: 320,
      accessorFn: (index) => index.name ?? "",
      cell: ({ row }) =>
        row.original.name ? (
          <Ellipsified>{row.original.name}</Ellipsified>
        ) : (
          EMPTY_CELL_PLACEHOLDER
        ),
    },
    {
      id: "kind",
      header: t`Type`,
      width: "auto",
      accessorFn: (index) => index.kind,
      cell: ({ row }) => <Code>{row.original.kind}</Code>,
    },
    {
      id: "columns",
      header: t`Columns`,
      minWidth: "auto",
      maxAutoWidth: 480,
      accessorFn: (index) => index.key_columns.join(", "),
      cell: ({ row }) => (
        <Group gap="xs" wrap="nowrap">
          {row.original.key_columns.map((name) => (
            <Code key={name}>{name}</Code>
          ))}
        </Group>
      ),
    },
  ];
}

type TableIndexListProps = {
  transformId: TransformId;
};

export function TableIndexList({ transformId }: TableIndexListProps) {
  const {
    data: indexes = [],
    isLoading,
    error,
  } = useListTableIndexesQuery({ "transform-id": transformId });

  const columns = useMemo(() => getColumns(), []);
  const data = useMemo<IndexRow[]>(
    () => indexes.map((index) => ({ ...index, id: getRowId(index) })),
    [indexes],
  );
  const instance = useTreeTableInstance<IndexRow>({
    data,
    columns,
    getNodeId: (row) => row.id,
  });

  return (
    <Stack gap="md" data-testid="table-indexes">
      <Group gap="md" justify="flex-start" wrap="nowrap">
        <Button
          component={ForwardRefLink}
          to={Urls.transformIndexes(transformId)}
          h={32}
          px="sm"
          py="xs"
          size="xs"
          leftSection={<Icon name="external" />}
        >
          {t`Manage indexes`}
        </Button>
      </Group>

      <LoadingAndErrorWrapper loading={isLoading} error={error}>
        <Card className={CS.overflowHidden} p={0} shadow="none" withBorder>
          <TreeTable
            instance={instance}
            emptyState={
              <ListEmptyState
                label={t`No indexes defined for this transform.`}
              />
            }
            ariaLabel={t`Table indexes`}
          />
        </Card>
      </LoadingAndErrorWrapper>
    </Stack>
  );
}
