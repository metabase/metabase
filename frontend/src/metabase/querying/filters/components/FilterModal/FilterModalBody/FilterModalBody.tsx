import type { GroupItem } from "metabase/querying/filters/types";
import type * as Lib from "metabase-lib";

import { FilterTabContent } from "./FilterTabContent";
import { FilterTabEmptyState } from "./FilterTabEmptyState";

type FilterModalBodyProps = {
  groupItems: GroupItem[];
  query: Lib.Query;
  tab: string | null;
  version: number;
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
  tab,
  version,
}: FilterModalBodyProps) =>
  groupItems.length > 0 ? (
    <FilterTabContent
      query={query}
      groupItems={groupItems}
      tab={tab}
      version={version}
      onChange={onChange}
      onInput={onInput}
      onTabChange={onTabChange}
    />
  ) : (
    <FilterTabEmptyState />
  );
