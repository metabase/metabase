import { useEffect, useMemo, useState } from "react";
import _ from "underscore";
import type {
  FilterTypeKeys,
  SearchFilterComponent,
  SearchFilterPropTypes,
  SearchFilters,
} from "metabase/search/types";
import { SearchFilterKeys } from "metabase/search/constants";
import { TypeFilter } from "./filters/TypeFilter";
import { Box } from "metabase/ui";

const filterMap: Record<FilterTypeKeys, SearchFilterComponent> = {
  [SearchFilterKeys.Type]: TypeFilter,
};

export const SearchFilterSidebar = ({
  value,
  onChangeFilters,
}: {
  value: SearchFilters;
  onChangeFilters: (filters: SearchFilters) => void;
}) => {
  const [output, setOutput] = useState<SearchFilters>(value);

  const onOutputChange = (
    key: FilterTypeKeys,
    val: SearchFilterPropTypes[FilterTypeKeys],
  ) => {
    if (!val || val.length === 0) {
      setOutput(_.omit(output, key));
    } else {
      setOutput({
        ...output,
        [key]: val,
      });
    }
  };

  useEffect(() => {
    setOutput(value);
  }, [value]);

  const clearFilters = () => {
    onChangeFilters({});
  };

  const applyFilters = () => {
    onChangeFilters(output);
  };

  // we can use this field to control which filters are available
  // - we can enable the 'verified' filter here
  const availableFilters: FilterTypeKeys[] = useMemo(() => {
    return [SearchFilterKeys.Type];
  }, []);

  return (
    <Box w="100%" h="100%">
      {availableFilters.map(key => {
        const Filter = filterMap[key];
        return (
          <Filter
            key={key}
            data-testid={`${key}-search-filter`}
            value={output[key]}
            onChange={value => onOutputChange(key, value)}
          />
        );
      })}
    </Box>
  );
};
