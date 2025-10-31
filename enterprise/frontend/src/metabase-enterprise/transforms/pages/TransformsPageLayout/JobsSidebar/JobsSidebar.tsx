import { useState } from "react";

import { SidebarContainer } from "../SidebarContainer";
import { SidebarSearch } from "../SidebarSearch";
import { SidebarSortControl } from "../SidebarSortControl";
import { TransformsInnerNav } from "../TransformsInnerNav";

interface JobsSidebarProps {
  selectedJobId?: number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const JobsSidebar = ({ selectedJobId }: JobsSidebarProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortType, setSortType] = useState<string | null>("last-modified");

  const handleAdd = () => {
    // TODO: Handle add job
  };

  return (
    <SidebarContainer>
      <TransformsInnerNav />
      <SidebarSearch value={searchQuery} onChange={setSearchQuery} />
      <SidebarSortControl
        value={sortType}
        onChange={setSortType}
        onAdd={handleAdd}
      />
      {/* TODO: Add JobsList component */}
    </SidebarContainer>
  );
};
