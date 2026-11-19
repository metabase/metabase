import { useMemo } from "react";
import { t } from "ttag";

import type { TreeTableColumnDef } from "metabase/ui";
import {
  Card,
  Ellipsified,
  Text,
  TreeTable,
  useTreeTableInstance,
} from "metabase/ui";
import type { ActionTestParameters } from "metabase-types/api";

import { DataTestSection } from "../../../components/DataTestSection";

type ActionTestParametersSectionProps = {
  parameters: ActionTestParameters;
};

type ParameterEntry = {
  id: string;
  name: string;
  value: string;
};

export function ActionTestParametersSection({
  parameters,
}: ActionTestParametersSectionProps) {
  const entries = useMemo(
    () =>
      Object.entries(parameters).map(([name, value]) => ({
        id: name,
        name,
        value: String(value),
      })),
    [parameters],
  );

  return (
    <DataTestSection
      label={t`Parameters`}
      description={t`The action runs with these values.`}
    >
      <Card withBorder p={0}>
        {entries.length > 0 ? (
          <ParametersTable entries={entries} />
        ) : (
          <Text c="text-secondary" px="lg" py="md">
            {t`This test sets no parameter values.`}
          </Text>
        )}
      </Card>
    </DataTestSection>
  );
}

type ParametersTableProps = {
  entries: ParameterEntry[];
};

function ParametersTable({ entries }: ParametersTableProps) {
  const columns = useMemo(
    (): TreeTableColumnDef<ParameterEntry>[] => [
      {
        id: "name",
        accessorKey: "name",
        header: t`Parameter`,
        minWidth: 120,
        cell: ({ row }) => <Ellipsified>{row.original.name}</Ellipsified>,
      },
      {
        id: "value",
        accessorKey: "value",
        header: t`Value`,
        minWidth: 120,
        cell: ({ row }) => <Ellipsified>{row.original.value}</Ellipsified>,
      },
    ],
    [],
  );

  const instance = useTreeTableInstance({
    data: entries,
    columns,
    getNodeId: (entry) => entry.id,
  });

  return (
    <TreeTable instance={instance} static ariaLabel={t`Parameter values`} />
  );
}
