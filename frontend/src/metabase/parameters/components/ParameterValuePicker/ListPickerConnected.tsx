import { useCallback, useState } from "react";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { fetchParameterValues } from "metabase/parameters/actions";
import type { Parameter } from "metabase-types/api";

import { ListPicker } from "./ListPicker";

interface ListPickerConnectedProps {
  value: string | string[];
  parameter: Parameter;
  onChange: (value: string | null) => void;
  forceSearchItemCount: number;
}

export function ListPickerConnected(props: ListPickerConnectedProps) {
  const dispatch = useDispatch();
  const { value, parameter, onChange: onChange, forceSearchItemCount } = props;
  const singleValue = Array.isArray(value) ? value[0] : value; // TODO why?

  const onClearValue = () => onChange(null);

  const staticValues =
    parameter.values_source_type === "static-list"
      ? (parameter.values_source_config?.values as string[])
      : null;

  const [isLoading, setIsLoading] = useState(false);
  // Needed to make Select pick the value without loaded values[]
  const [values, setValues] = useState<string[]>([singleValue]);

  const fetchValues = useCallback(
    async (query: string) => {
      // console.log("fetch", query, values, value);
      setIsLoading(true);
      const res = await dispatch(fetchParameterValues({ parameter, query }));
      // TODO WHY?
      setValues(res.values.flat(1) as string[]);
      setIsLoading(false);
    },
    [dispatch, parameter],
  );

  // const onSearch = (query: string) => {};

  const enableSearch =
    !staticValues || staticValues.length > forceSearchItemCount;

  return (
    <ListPicker
      value={singleValue}
      values={staticValues ?? values}
      onClear={onClearValue}
      onChange={onChange}
      onSearchChange={fetchValues}
      // onDropdownOpen={enableSearch ? undefined : fetchValuesInitially}
      enableSearch={enableSearch}
      placeholder={
        enableSearch ? t`Start typing to filter…` : t`Select a default value…`
      }
      isLoading={isLoading}
      noResultsText={isLoading ? t`Loading…` : t`No matching result`}
    />
  );
}
