import { Flex } from "metabase/ui";
import type {
  DependencyNode,
  ReplaceSourceColumnMapping,
} from "metabase-types/api";

import type { EntityInfo, TabType } from "../types";

import { ColumnComparisonTable } from "./ColumnMappingTable";
import { EmptyState } from "./EmptyState";
import { TabPanel } from "./TabPanel";

type ModalBodyProps = {
  sourceInfo: EntityInfo | undefined;
  targetInfo: EntityInfo | undefined;
  selectedTab: TabType;
  canReplace: boolean;
  dependents: DependencyNode[];
  columnMappings: ReplaceSourceColumnMapping[];
  onTabChange: (tab: TabType) => void;
};

export function ModalBody({
  sourceInfo,
  targetInfo,
  selectedTab,
  canReplace,
  dependents,
  columnMappings,
  onTabChange,
}: ModalBodyProps) {
  if (columnMappings.length === 0) {
    return (
      <Flex flex={1} direction="column" p="lg" bg="background-secondary">
        <EmptyState />
      </Flex>
    );
  }

  return (
    <Flex flex={1} direction="column" bg="background-secondary">
      <TabPanel
        selectedTab={selectedTab}
        canReplace={canReplace}
        dependentsCount={dependents.length}
        onTabChange={onTabChange}
      />
      <Flex flex={1} direction="column" p="lg" mih={0} miw={0}>
        <ColumnComparisonTable
          sourceInfo={sourceInfo}
          targetInfo={targetInfo}
          columnMappings={columnMappings}
        />
      </Flex>
    </Flex>
  );
}
