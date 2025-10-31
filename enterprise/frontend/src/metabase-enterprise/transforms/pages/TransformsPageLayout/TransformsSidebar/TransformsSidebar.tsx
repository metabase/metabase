import { useState } from "react";

import { SidebarContainer } from "../SidebarContainer";
import { SidebarSearch } from "../SidebarSearch";
import { SidebarSortControl } from "../SidebarSortControl";
import { TransformsInnerNav } from "../TransformsInnerNav";
import { TransformsList } from "../TransformsSidebarLayout/TransformsList";

interface TransformsSidebarProps {
  selectedTransformId?: number;
}

export const TransformsSidebar = ({
  selectedTransformId,
}: TransformsSidebarProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortType, setSortType] = useState<string | null>("last-modified");

  return (
    <SidebarContainer>
      <TransformsInnerNav />
      <SidebarSearch value={searchQuery} onChange={setSearchQuery} />
      <SidebarSortControl value={sortType} onChange={setSortType} />
      <TransformsList selectedTransformId={selectedTransformId} />
    </SidebarContainer>
  );
};
