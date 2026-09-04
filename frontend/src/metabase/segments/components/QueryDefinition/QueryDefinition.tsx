import { getMetadata } from "metabase/metadata-store";
import { FilterPill } from "metabase/querying/filters/components/FilterPanel/FilterPill";
import { useSelector } from "metabase/redux";
import { Flex } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { DatasetQuery, TableId } from "metabase-types/api";

import { getSegmentQuery } from "../../utils";

const STAGE_INDEX = -1;

type QueryDefinitionProps = {
  className?: string;
  definition: DatasetQuery;
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
    <Flex className={className} gap="lg" wrap="wrap">
      {filters.map((filter, filterIndex) => (
        <FilterPill key={filterIndex}>
          {Lib.displayInfo(query, STAGE_INDEX, filter).displayName}
        </FilterPill>
      ))}
    </Flex>
  );
}
