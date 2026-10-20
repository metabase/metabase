import { useState } from "react";

import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { Popover } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { getFilterLabel } from "../../harness/clauses";
import { Token } from "../or-pills/Token";

type ClauseTokenProps = {
  query: Lib.Query;
  stageIndex: number;
  clause: Lib.FilterClause;
  onReplace: (filterable: Lib.Filterable) => void;
  onRemove: () => void;
};

export function ClauseToken({
  query,
  stageIndex,
  clause,
  onReplace,
  onRemove,
}: ClauseTokenProps) {
  const [isOpened, setIsOpened] = useState(false);

  return (
    <Popover
      opened={isOpened}
      position="bottom-start"
      transitionProps={{ duration: 0 }}
      // Rendered inside the editor's dropdown, so clicking the picker is not
      // an outside click for the editor's own popover.
      withinPortal={false}
      onChange={setIsOpened}
    >
      <Popover.Target>
        <Token
          onClick={() => setIsOpened((opened) => !opened)}
          onRemove={onRemove}
        >
          {getFilterLabel(query, stageIndex, clause)}
        </Token>
      </Popover.Target>
      <Popover.Dropdown>
        <FilterPicker
          query={query}
          stageIndex={stageIndex}
          filter={clause}
          onSelect={(filterable) => {
            onReplace(filterable);
            setIsOpened(false);
          }}
          onClose={() => setIsOpened(false)}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
