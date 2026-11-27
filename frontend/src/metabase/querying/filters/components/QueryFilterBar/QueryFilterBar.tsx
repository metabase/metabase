import { useMemo } from "react";

import {
  FilterBar,
  type FilterEditorProps,
  type FilterStages,
} from "metabase/filter-bar";
import * as Lib from "metabase-lib";

import { FilterPicker } from "../FilterPicker";
import { FilterPickerBody } from "../FilterPicker/FilterPickerBody";

import { createQueryAdapter, findColumnByKey } from "./adapter";
import {
  type QueryFilter,
  applyQueryStages,
  getFilterQuery,
  getQueryStages,
} from "./stages";

type QueryFilterBarProps = {
  query: Lib.Query;
  onChange: (query: Lib.Query) => void;
};

const toFilterClause = (
  query: Lib.Query,
  stageIndex: number,
  filter: QueryFilter,
) => Lib.filters(Lib.filter(query, stageIndex, filter), stageIndex).at(-1);

type QueryFilterEditorProps = FilterEditorProps<QueryFilter> & {
  query: Lib.Query;
  stageIndex: number;
};

const QueryFilterEditor = ({
  query,
  stageIndex,
  onChange,
  onClose,
  ...props
}: QueryFilterEditorProps) => {
  if (props.type === "new" && props.column) {
    const column = findColumnByKey(query, stageIndex, props.column.key);
    return column ? (
      <FilterPickerBody
        query={query}
        stageIndex={stageIndex}
        column={column}
        onChange={onChange}
      />
    ) : null;
  }
  return (
    <FilterPicker
      query={query}
      stageIndex={stageIndex}
      filter={
        props.type === "edit"
          ? toFilterClause(query, stageIndex, props.filter)
          : undefined
      }
      onSelect={onChange}
      onClose={onClose}
    />
  );
};

export const QueryFilterBar = ({ query, onChange }: QueryFilterBarProps) => {
  const filterQuery = useMemo(() => getFilterQuery(query), [query]);
  const stages = useMemo(() => getQueryStages(query), [query]);
  const adapter = useMemo(() => {
    const queryAdapter = createQueryAdapter(filterQuery);
    return {
      stage: (stageIndex: number) => ({
        ...queryAdapter.stage(stageIndex),
        renderFilterEditor: (props: FilterEditorProps<QueryFilter>) => (
          <QueryFilterEditor
            {...props}
            query={filterQuery}
            stageIndex={stageIndex}
          />
        ),
      }),
    };
  }, [filterQuery]);

  const handleChange = (nextStages: FilterStages<QueryFilter>) => {
    onChange(applyQueryStages(query, nextStages));
  };

  return <FilterBar value={stages} onChange={handleChange} adapter={adapter} />;
};
