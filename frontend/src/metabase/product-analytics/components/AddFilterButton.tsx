import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { t } from "ttag";

import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { Icon, Popover, UnstyledButton } from "metabase/ui";
import * as Lib from "metabase-lib";

import S from "./AddFilterButton.module.css";

const STAGE_INDEX = -1;

type AddFilterButtonProps = {
  query: Lib.Query;
  /** Opens the filter picker on mount. */
  isInitiallyOpened: boolean;
  onChange: (query: Lib.Query) => void;
};

/**
 * Adds a filter to the query with the query builder's filter picker. It's a
 * round + after other filters, and a "New filter" pill when there are none.
 */
export const AddFilterButton = ({
  query,
  isInitiallyOpened,
  onChange,
}: AddFilterButtonProps) => {
  const [isOpened, { close, toggle }] = useDisclosure(isInitiallyOpened);
  const hasFilters = Lib.filters(query, STAGE_INDEX).length > 0;

  const handleSelect = (filter: Lib.Filterable) => {
    onChange(Lib.filter(query, STAGE_INDEX, filter));
    close();
  };

  return (
    <Popover opened={isOpened} position="bottom-start" onDismiss={close}>
      <Popover.Target>
        {hasFilters ? (
          <UnstyledButton
            className={cx(S.button, S.add)}
            aria-label={t`Add a filter`}
            onClick={toggle}
          >
            <Icon name="add" size={12} />
          </UnstyledButton>
        ) : (
          <UnstyledButton
            className={S.button}
            px="sm"
            fw="bold"
            onClick={toggle}
          >
            {t`New filter`}
          </UnstyledButton>
        )}
      </Popover.Target>
      <Popover.Dropdown>
        <FilterPicker
          query={query}
          stageIndex={STAGE_INDEX}
          onSelect={handleSelect}
          onClose={close}
        />
      </Popover.Dropdown>
    </Popover>
  );
};
