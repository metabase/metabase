import { c, t } from "ttag";
import Question from "metabase-lib/v1/Question";
import { HoverCard } from "metabase/ui";
import type Field from "metabase-lib/v1/metadata/Field";
import { SidesheetCard } from "metabase/common/components/Sidesheet";
import { getSemanticTypeIcon } from "metabase/lib/schema_metadata";
import {
  FieldListItem,
  FieldIcon,
  FieldTitle,
} from "metabase/models/components/ModelDetailPage/ModelSchemaDetails/ModelSchemaDetails.styled";
import { QueryColumnInfo } from "metabase/components/MetadataInfo/ColumnInfo";
import { getGroupItems } from "metabase/querying/filters/hooks/use-filter-modal/utils/filters";
import { ColumnItem } from "metabase/querying/filters/types";

const Column = ({ col }: { col: ColumnItem }) => {
  return (
    <FieldListItem key={col.displayName + col.stageIndex}>
      <HoverCard position="left-start">
        <HoverCard.Target>
          <FieldIcon name="eye_filled" />
        </HoverCard.Target>
        <HoverCard.Dropdown>
          <QueryColumnInfo
            // FIXME: correct the stageindex
            stageIndex={col.stageIndex}
            column={col.column}
          />
        </HoverCard.Dropdown>
      </HoverCard>
      <FieldTitle>{col.displayName}</FieldTitle>
    </FieldListItem>
  );
};

export const SidesheetCardWithFields = ({
  question,
}: {
  question: Question;
}) => {
  const items = getGroupItems(question.query());
  const columns = items[0]?.columnItems;

  return (
    <SidesheetCard>
      {c("{0} is the number of fields").t`${columns.length} fields`}
      {columns.map(col => (
        <Column col={col} />
      ))}
    </SidesheetCard>
  );
};
