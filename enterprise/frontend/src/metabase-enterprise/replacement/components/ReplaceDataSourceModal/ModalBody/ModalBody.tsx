import { Flex } from "metabase/ui";
import type { ReplaceSourceColumnMapping } from "metabase-types/api";

import type { EntityInfo } from "../types";

import { ColumnComparisonTable } from "./ColumnMappingTable";
import { EmptyState } from "./EmptyState";

type ModalBodyProps = {
  sourceInfo: EntityInfo | undefined;
  targetInfo: EntityInfo | undefined;
  columnMappings: ReplaceSourceColumnMapping[];
};

export function ModalBody({
  sourceInfo,
  targetInfo,
  columnMappings,
}: ModalBodyProps) {
  return (
    <Flex flex={1} direction="column" mih={0} p="lg" bg="background-secondary">
      {columnMappings.length === 0 ? (
        <EmptyState />
      ) : (
        <ColumnComparisonTable
          sourceInfo={sourceInfo}
          targetInfo={targetInfo}
          columnMappings={columnMappings}
        />
      )}
    </Flex>
  );
}
