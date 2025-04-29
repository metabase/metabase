import { c, msgid } from "ttag";

import { SidesheetCard } from "metabase/common/components/Sidesheet";
import { QueryColumnInfoIcon } from "metabase/components/MetadataInfo/ColumnInfoIcon";
import { Box, Group, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export const SidesheetCardWithFields = ({
  question,
}: {
  question: Question;
}) => {
  const query = question.query();
  const columns = Lib.returnedColumns(query, -1);
  const columnCount = columns.length;

  const title = c("{0} is the number of fields").ngettext(
    msgid`${columnCount} field`,
    `${columnCount} fields`,
    columnCount,
  );

  return (
    <SidesheetCard title={<Box pb="sm">{title}</Box>}>
      <Stack gap="md">
        {columns.map((columnMetadata) => {
          const columnDisplayInfo = Lib.displayInfo(query, -1, columnMetadata);

          return (
            <Column
              query={query}
              columnMetadata={columnMetadata}
              columnDisplayInfo={columnDisplayInfo}
              key={columnDisplayInfo.name}
            />
          );
        })}
      </Stack>
    </SidesheetCard>
  );
};

const Column = ({
  query,
  columnMetadata,
  columnDisplayInfo: columnInfo,
}: {
  query: Lib.Query;
  columnMetadata: Lib.ColumnMetadata;
  columnDisplayInfo: Lib.ColumnDisplayInfo;
}) => {
  return (
    <Group gap="sm" role="listitem">
      <QueryColumnInfoIcon
        position="left-start"
        query={query}
        column={columnMetadata}
        stageIndex={-1}
      />
      {columnInfo.displayName}
    </Group>
  );
};
