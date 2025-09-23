import { getSegmentQuery } from "metabase/admin/datamodel/utils/segments";
import { useSelector } from "metabase/lib/redux";
import { FilterPill } from "metabase/querying/filters/components/FilterPanel/FilterPill";
import { getMetadata } from "metabase/selectors/metadata";
import { Flex } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { StructuredQuery, TableId } from "metabase-types/api";

const STAGE_INDEX = -1;

type QueryDefinitionProps = {
  className?: string;
  definition: StructuredQuery;
  tableId: TableId;
};

export function QueryDefinition({
  className,
  tableId,
  definition,
}: QueryDefinitionProps) {
  const metadata = useSelector(getMetadata);
  const query = getSegmentQuery(definition, tableId, metadata);
  if (!query) {
    return null;
  }

  const filters = Lib.filters(query, STAGE_INDEX);

  return (
    <Flex className={className} gap="md" wrap="wrap">
      {filters.map((filter, filterIndex) => (
        <FilterPill key={filterIndex}>
          {Lib.displayInfo(query, STAGE_INDEX, filter).displayName}
        </FilterPill>
      ))}
    </Flex>
  );
}
