import { Popover, Icon } from "metabase/ui";
import { NotebookCellItem } from "../NotebookCell";
import { FilterPopover } from "./FilterPopover";

import CS from "metabase/css/core/index.css";
import { useState } from "react";

interface FilterSuggestionProps {
  field: any;
  query: any;
  stageIndex: number;
  handleAddFilter: any;
  handleUpdateFilter: any;
}

export const FilterSuggestion = ({
  field,
  query,
  stageIndex,
  handleAddFilter,
  handleUpdateFilter,
}: FilterSuggestionProps) => {
  const [opened, setOpened] = useState(false);

  return (
    <Popover opened={opened} onChange={setOpened}>
      <Popover.Target>
        <NotebookCellItem
          color="#8F90EA33"
          containerStyle={{
            color: "#7173AD",
            border: "1px dashed",
            boxSizing: "border-box",
            background: "linear-gradient(to left, #8DC0ED33, #8F90EA33)",
          }}
          onClick={() => setOpened(true)}
        >
          <Icon className={CS.mr1} name="sparkles" />
          {field.display_name}
          <Icon className={CS.ml1} name="add" />
        </NotebookCellItem>
      </Popover.Target>
      <Popover.Dropdown>
        <FilterPopover
          initialColumn={field.column}
          query={query}
          stageIndex={stageIndex}
          onAddFilter={clause => {
            setOpened(false);
            handleAddFilter(clause);
          }}
          onUpdateFilter={handleUpdateFilter}
        />
      </Popover.Dropdown>
    </Popover>
  );
};
