import { c, msgid } from "ttag";

import {
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { QueryColumnInfoIcon } from "metabase/common/components/MetadataInfo/QueryColumnInfoIcon";
import { Group, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

const LAST_STAGE = -1;

export const QuestionFieldsSection = ({ question }: { question: Question }) => {
  const query = question.query();
  const columns = Lib.returnedColumns(query, LAST_STAGE);
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
      <DetailsTable role="list" aria-label={title}>
        {columns.map((column) => {
          const { name, displayName } = Lib.displayInfo(
            query,
            LAST_STAGE,
            column,
          );

          return (
            <Group
              key={name}
              gap="sm"
              px="lg"
              py="sm"
              wrap="nowrap"
              role="listitem"
            >
              <QueryColumnInfoIcon
                position="left-start"
                query={query}
                column={column}
                stageIndex={LAST_STAGE}
              />
              <Text c="text-primary">{displayName}</Text>
            </Group>
          );
        })}
      </DetailsTable>
    </SidebarSection>
  );
};
