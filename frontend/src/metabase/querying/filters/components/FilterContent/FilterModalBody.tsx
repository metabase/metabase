import type * as Lib from "metabase-lib";

import { FilterModalEmptyState } from "./FilterModalEmptyState";
import { TabContent } from "./TabContent";
import type { GroupItem } from "./types";

type FilterModalBodyProps = {
  groupItems: GroupItem[];
  query: Lib.Query;
  tab: string | null;
  version: number;
  searching: boolean;
  onChange: (newQuery: Lib.Query) => void;
  onInput: () => void;
  onTabChange: (
    value: ((prevState: string | null) => string | null) | string | null,
  ) => void;
};

export const FilterModalBody = ({
  groupItems,
  onChange,
  onInput,
  onTabChange,
  query,
  searching,
  tab,
  version,
}: FilterModalBodyProps) =>
  groupItems.length > 0 ? (
    <TabContent
      query={query}
      groupItems={groupItems}
      tab={tab}
      version={version}
      isSearching={searching}
      onChange={onChange}
      onInput={onInput}
      onTabChange={onTabChange}
    />
  ) : (
    <FilterModalEmptyState />
  );
