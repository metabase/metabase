import { c, msgid } from "ttag";

import {
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { QueryColumnInfoIcon } from "metabase/common/components/MetadataInfo/QueryColumnInfoIcon";
import { Group, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export const QuestionFieldsSection = ({ question }: { question: Question }) => {
  const query = question.query();
  const columns = Lib.returnedColumns(query, -1);
  const columnCount = columns.length;

  if (columnCount === 0) {
    return null;
  }

  const title = c("{0} is the number of fields").ngettext(
    msgid`${columnCount} field`,
    `${columnCount} fields`,
    columnCount,
  );

  return (
    <SidebarSection title={title}>
      <DetailsTable>
        {columns.map((columnMetadata) => {
          const columnDisplayInfo = Lib.displayInfo(query, -1, columnMetadata);

          return (
            <Group
              key={columnDisplayInfo.name}
              gap="sm"
              px="lg"
              py="sm"
              wrap="nowrap"
              role="listitem"
            >
              <QueryColumnInfoIcon
                position="left-start"
                query={query}
                column={columnMetadata}
                stageIndex={-1}
              />
              <Text c="text-primary">{columnDisplayInfo.displayName}</Text>
            </Group>
          );
        })}
      </DetailsTable>
    </SidebarSection>
  );
};
