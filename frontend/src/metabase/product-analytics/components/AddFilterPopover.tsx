import type { ReactElement } from "react";

import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { Popover } from "metabase/ui";
import * as Lib from "metabase-lib";

const STAGE_INDEX = -1;

type AddFilterPopoverProps = {
  /** The popover stays closed while this is undefined. */
  query: Lib.Query | undefined;
  isOpened: boolean;
  onChange: (query: Lib.Query) => void;
  onClose: () => void;
  /** The element the popover opens from. */
  children: ReactElement;
};

/** The query builder's filter picker in a popover. Adds the picked filter to the query. */
export const AddFilterPopover = ({
  query,
  isOpened,
  onChange,
  onClose,
  children,
}: AddFilterPopoverProps) => (
  <Popover
    opened={isOpened && query !== undefined}
    position="bottom-start"
    onDismiss={onClose}
  >
    <Popover.Target>{children}</Popover.Target>
    <Popover.Dropdown>
      {query !== undefined && (
        <FilterPicker
          query={query}
          stageIndex={STAGE_INDEX}
          onSelect={(filter) => {
            onChange(Lib.filter(query, STAGE_INDEX, filter));
            onClose();
          }}
          onClose={onClose}
        />
      )}
    </Popover.Dropdown>
  </Popover>
);
