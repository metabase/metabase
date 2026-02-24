import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import {
  Alert,
  Card,
  Icon,
  SimpleGrid,
  Stack,
  Title,
  TreeTable,
  type TreeTableColumnDef,
  useTreeTableInstance,
} from "metabase/ui";

import { treeTableStyles } from "../../styles";

import type { FieldInfoSectionProps, FieldTreeNode } from "./types";
import { buildTableNodes, getColumns } from "./utils";

export const FieldInfoSection = ({
  sources,
  target,
}: FieldInfoSectionProps) => {
  const sourceData = useMemo(() => buildTableNodes(sources), [sources]);
  const targetData = useMemo(
    () => (target ? buildTableNodes([target]) : []),
    [target],
  );

  const columns: TreeTableColumnDef<FieldTreeNode>[] = useMemo(
    () => getColumns(),
    [],
  );

  const handleRowClick = useCallback((row: Row<FieldTreeNode>) => {
    if (row.getCanExpand()) {
      row.toggleExpanded();
    }
  }, []);

  const sourceInstance = useTreeTableInstance({
    data: sourceData,
    columns,
    getNodeId: (node) => node.id,
    getSubRows: (node) => node.children,
    defaultExpanded: true,
  });

  const targetInstance = useTreeTableInstance({
    data: targetData,
    columns,
    getNodeId: (node) => node.id,
    getSubRows: (node) => node.children,
    defaultExpanded: true,
  });

  return (
    <SimpleGrid cols={2} spacing="lg" data-testid="generic-summary-fields">
      <Stack gap="md">
        <Title order={4}>{t`Input fields`}</Title>
        {sources.length > 0 ? (
          <Card p={0} shadow="none" withBorder>
            <TreeTable
              instance={sourceInstance}
              onRowClick={handleRowClick}
              styles={treeTableStyles}
            />
          </Card>
        ) : (
          <Alert
            color="warning"
            icon={<Icon name="warning" />}
          >{t`Missing input data`}</Alert>
        )}
      </Stack>

      <Stack gap="md">
        <Title order={4}>{t`Output fields`}</Title>
        {target ? (
          <Card p={0} shadow="none" withBorder>
            <TreeTable
              instance={targetInstance}
              onRowClick={handleRowClick}
              styles={treeTableStyles}
            />
          </Card>
        ) : (
          <Alert
            color="warning"
            icon={<Icon name="warning" />}
          >{t`No output table`}</Alert>
        )}
      </Stack>
    </SimpleGrid>
  );
};
