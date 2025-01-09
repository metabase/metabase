import { c, msgid } from "ttag";

import { SidesheetCard } from "metabase/common/components/Sidesheet";
import { QueryColumnInfoIcon } from "metabase/components/MetadataInfo/ColumnInfoIcon";
import { Box, Group } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export const SidesheetCardWithFields = ({
  question,
}: {
  question: Question;
}) => {
  const query = question.query();
  // FIXME: I'm not sure that visibleColumns is what we want here
  const columns = Lib.visibleColumns(query, -1);

  const columnCount = columns.length;

  const title = c("{0} is the number of fields").ngettext(
    msgid`${columnCount} field`,
    msgid`${columnCount} fields`,
    columnCount,
  );

  return (
    <SidesheetCard
      title={<Box pb="sm">{title}</Box>}
      stackProps={{ spacing: "md" }}
    >
      {columns.map(columnMetadata => {
        const columnDisplayInfo = Lib.displayInfo(query, -1, columnMetadata);

        return (
          <Column
            columnMetadata={columnMetadata}
            query={query}
            columnDisplayInfo={columnDisplayInfo}
            key={columnDisplayInfo.name}
          />
        );
      })}
    </SidesheetCard>
  );
};

const Column = ({
  columnMetadata,
  columnDisplayInfo: columnInfo,
  query,
}: {
  columnMetadata: Lib.ColumnMetadata;
  columnDisplayInfo: Lib.ColumnDisplayInfo;
  query: Lib.Query;
}) => {
  return (
    <Group spacing="sm">
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
