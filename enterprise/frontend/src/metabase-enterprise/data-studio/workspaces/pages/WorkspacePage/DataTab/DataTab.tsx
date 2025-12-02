import { t } from "ttag";

import { Stack, Text } from "metabase/ui";
import type { WorkspaceTablesResponse } from "metabase-types/api";

import { TableListItem } from "./TableListItem";

type DataTabProps = {
  tables: WorkspaceTablesResponse;
};

export const DataTab = ({ tables }: DataTabProps) => {
  return (
    <Stack h="100%" gap="sm">
      <Stack
        gap="xs"
        pb="sm"
        style={{ borderBottom: "1px solid var(--mb-color-border)" }}
      >
        <Text fw={600}>{t`Data active in this workspace`}</Text>
        <Stack gap={0}>
          {tables.outputs.map((table, index) => (
            <TableListItem
              key={`output-${index}`}
              name={table.global?.table || ""}
              schema={table.global?.schema}
              icon="table"
              type="output"
              hasChanges={!!table.workspace}
            />
          ))}
        </Stack>
        <Stack gap={0}>
          {tables.inputs.map((table, index) => (
            <TableListItem
              key={`input-${index}`}
              name={table.table || ""}
              schema={table.schema}
              icon="table"
              type="input"
            />
          ))}
        </Stack>
      </Stack>
    </Stack>
  );
};
