import { c } from "ttag";

import { SidesheetCard } from "metabase/common/components/Sidesheet";
import { QueryColumnInfoIcon } from "metabase/components/MetadataInfo/ColumnInfoIcon";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import {
  FieldListItem,
  FieldTitle,
} from "metabase/models/components/ModelDetailPage/ModelSchemaDetails/ModelSchemaDetails.styled";
import { getGroupItems } from "metabase/querying/filters/hooks/use-filter-modal/utils/filters";
import type { ColumnItem } from "metabase/querying/filters/types";
import { Title } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

const Column = ({
  columnItem,
  query,
}: {
  columnItem: ColumnItem;
  query: Lib.Query;
}) => {
  const { column, displayName, stageIndex } = columnItem;
  return (
    <FieldListItem key={`${displayName}${stageIndex}`}>
      <QueryColumnInfoIcon
        position="left-start"
        query={query}
        stageIndex={stageIndex}
        column={column}
      />
      <FieldTitle>{displayName}</FieldTitle>
    </FieldListItem>
  );
};

export const SidesheetCardWithFields = ({
  question,
}: {
  question: Question;
}) => {
  const query = question.query();
  const items = getGroupItems(query);

  // FIXME: This is probably wrong. What are the groups?
  const columnItems = items[0]?.columnItems;

  const titleId = useUniqueId();

  return (
    <SidesheetCard aria-labelledby={titleId}>
      <Title order={4} fw="normal" id={titleId}>
        {c("{0} is the number of fields").t`${columnItems.length} fields`}
      </Title>
      {columnItems.map(columnItem => (
        <Column
          key={`${columnItem.displayName}-${columnItem.stageIndex}`}
          query={query}
          columnItem={columnItem}
        />
      ))}
    </SidesheetCard>
  );
};
