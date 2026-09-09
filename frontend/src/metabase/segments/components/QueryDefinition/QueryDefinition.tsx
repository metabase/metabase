import { useMetadataProvider } from "metabase/metadata-store";
import { FilterPill } from "metabase/querying/filters/components/FilterPanel/FilterPill";
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
  const metadataProvider = useMetadataProvider(definition?.database ?? null);
  const query = getSegmentQuery(definition, tableId, metadataProvider);
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
