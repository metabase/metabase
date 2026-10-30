import { useMetadataProvider } from "metabase/metadata-store";
import { FilterPill } from "metabase/querying/filters/components/FilterPanel/FilterPill";
import { Flex, Stack, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Segment, Table } from "metabase-types/api";

import { readSegmentDefinition } from "../../segments/to-event-definition";

const STAGE_INDEX = -1;

type SegmentDefinitionProps = {
  segment: Segment;
  table: Table | undefined;
};

/**
 * A saved segment's description and conditions, read-only. Falls back to the
 * server's summary of the definition when the conditions can't be read.
 */
export const SegmentDefinition = ({
  segment,
  table,
}: SegmentDefinitionProps) => {
  const metadataProvider = useMetadataProvider(table?.db_id ?? null);
  const query = readSegmentDefinition(metadataProvider, segment.definition);
  const conditions =
    query !== undefined
      ? Lib.filters(query, STAGE_INDEX).map(
          (filter) => Lib.displayInfo(query, STAGE_INDEX, filter).displayName,
        )
      : [];

  return (
    <Stack gap="sm">
      {segment.description && (
        <Text size="sm" c="text-secondary">
          {segment.description}
        </Text>
      )}
      {conditions.length > 0 ? (
        <Flex gap="xs" wrap="wrap">
          {conditions.map((condition, index) => (
            <FilterPill key={index} readOnly>
              {condition}
            </FilterPill>
          ))}
        </Flex>
      ) : (
        <Text size="sm" c="text-secondary">
          {segment.definition_description}
        </Text>
      )}
    </Stack>
  );
};
