import { getSegmentQuery } from "metabase/admin/datamodel/utils/segments";
import { useSelector } from "metabase/lib/redux";
import { FilterPill } from "metabase/querying/filters/components/FilterPanel/FilterPill";
import { getMetadata } from "metabase/selectors/metadata";
import { Flex } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { StructuredQuery, TableId } from "metabase-types/api";

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

  const stageIndex = -1;
  const filters = query ? Lib.filters(query, -1) : [];

  return (
    <Flex className={className} gap="md" wrap="wrap">
      {filters.map((filter, filterIndex) => (
        <FilterPill key={filterIndex}>
          {Lib.displayInfo(query, stageIndex, filter).displayName}
        </FilterPill>
      ))}
    </Flex>
  );
}
