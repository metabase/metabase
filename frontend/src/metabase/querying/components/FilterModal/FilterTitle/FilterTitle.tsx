import type { ReactNode } from "react";

import type { IconName } from "metabase/ui";
import { Flex, Icon } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { FilterColumnName } from "../FilterColumnName";

import { InfoIcon, HoverParent } from "./FilterTitle.styled";
export { HoverParent };

type FilterTitleProps = {
  children?: ReactNode;
  column: Lib.ColumnMetadata;
  columnIcon: IconName;
  isSearching: boolean;
  query: Lib.Query;
  stageIndex: number;
};

export function FilterTitle({
  children,
  column,
  columnIcon,
  isSearching,
  query,
  stageIndex,
}: FilterTitleProps) {
  return (
    <Flex h="100%" align="center" gap="sm">
      <InfoIcon query={query} stageIndex={stageIndex} column={column} />
      <Icon name={columnIcon} />
      <FilterColumnName
        query={query}
        stageIndex={stageIndex}
        column={column}
        isSearching={isSearching}
      />
      {children}
    </Flex>
  );
}
