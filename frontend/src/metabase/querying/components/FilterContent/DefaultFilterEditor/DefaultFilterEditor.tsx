import { useMemo } from "react";

import { getColumnIcon } from "metabase/common/utils/columns";
import { Checkbox, Grid, Group } from "metabase/ui";

import {
  useDefaultFilter,
  type OperatorOption,
} from "../../../hooks/use-default-filter";
import { FilterTitle, HoverParent } from "../FilterTitle";
import type { FilterEditorProps } from "../types";

export function DefaultFilterEditor({
  query,
  stageIndex,
  column,
  filter,
  isSearching,
  onChange,
}: FilterEditorProps) {
  const columnIcon = useMemo(() => {
    return getColumnIcon(column);
  }, [column]);

  const { operator, availableOptions, getFilterClause, setOperator } =
    useDefaultFilter({
      query,
      stageIndex,
      column,
      filter,
    });

  const handleOperatorChange = (option: OperatorOption, isChecked: boolean) => {
    const newOperator = isChecked ? option.operator : undefined;
    setOperator(newOperator);
    onChange(getFilterClause(newOperator));
  };

  return (
    <HoverParent>
      <Grid grow>
        <Grid.Col span="auto">
          <FilterTitle
            query={query}
            stageIndex={stageIndex}
            column={column}
            columnIcon={columnIcon}
            isSearching={isSearching}
          />
        </Grid.Col>
        <Grid.Col span={4}>
          <Group spacing="md">
            {availableOptions.map(option => (
              <Checkbox
                key={option.operator}
                label={option.name}
                checked={option.operator === operator}
                onChange={event =>
                  handleOperatorChange(option, event.target.checked)
                }
              />
            ))}
          </Group>
        </Grid.Col>
      </Grid>
    </HoverParent>
  );
}
