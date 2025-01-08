import { c } from "ttag";
import Question from "metabase-lib/v1/Question";
import { SidesheetCard } from "metabase/common/components/Sidesheet";
import {
  FieldListItem,
  FieldTitle,
} from "metabase/models/components/ModelDetailPage/ModelSchemaDetails/ModelSchemaDetails.styled";
import { getGroupItems } from "metabase/querying/filters/hooks/use-filter-modal/utils/filters";
import { ColumnItem } from "metabase/querying/filters/types";
import { QueryColumnInfoIcon } from "metabase/components/MetadataInfo/ColumnInfoIcon";

const Column = ({
  columnItem,
  query,
}: {
  columnItem: ColumnItem;
  query: Lib.Query;
}) => {
  const { displayName, stageIndex } = columnItem;
  console.log("@m5nm8xgg", "columnItem", columnItem);

  // FIXME: The popover content is not accurate
  return (
    <FieldListItem key={`${displayName}${stageIndex}`}>
      <QueryColumnInfoIcon
        position="left-start"
        query={query}
        tabIndex={0}
        {...columnItem}
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

  return (
    <SidesheetCard>
      {c("{0} is the number of fields").t`${columnItems.length} fields`}
      {columnItems.map(columnItem => (
        <Column query={query} columnItem={columnItem} />
      ))}
    </SidesheetCard>
  );
};
