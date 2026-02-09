import { useMemo, useState } from "react";
import { t } from "ttag";

import { SimpleDateFilterPicker } from "metabase/querying/filters/components/FilterPicker/DateFilterPicker";
import { Button, Icon, Popover } from "metabase/ui";
import * as Lib from "metabase-lib";

import { STAGE_INDEX } from "../../../constants";

import S from "./FilterButton.module.css";

type FilterButtonProps = {
  query: Lib.Query;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  onChange: (newFilter: Lib.ExpressionClause | undefined) => void;
};

export function FilterButton({
  query,
  column,
  filter,
  onChange,
}: FilterButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const filterName = useMemo(() => {
    return filter
      ? Lib.filterArgsDisplayName(query, STAGE_INDEX, filter)
      : t`All time`;
  }, [query, filter]);

  const handleChange = (newFilter: Lib.ExpressionClause | undefined) => {
    onChange(newFilter);
    setIsOpen(false);
  };

  return (
    <Popover opened={isOpen} onChange={setIsOpen}>
      <Popover.Target>
        <Button
          className={S.controlButton}
          variant="subtle"
          color="text-primary"
          rightSection={<Icon name="chevrondown" size={12} />}
          onClick={() => setIsOpen(!isOpen)}
        >
          {filterName}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <SimpleDateFilterPicker
          query={query}
          stageIndex={STAGE_INDEX}
          column={column}
          filter={filter}
          onChange={handleChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
