import { useCallback, useState } from "react";
import { useDeepCompareEffect } from "react-use";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { fetchParameterValues } from "metabase/parameters/actions";
import type { Parameter } from "metabase-types/api";

import { ListPicker } from "./ListPicker";
import { getListParameterStaticValues } from "./core";

interface ListPickerConnectedProps {
  value: string;
  parameter: Parameter;
  onChange: (value: string | null) => void;
  forceSearchItemCount: number;
}

// TODO when parameter changes, reset internal state (or rather move to state in Redux)
// TODO debounced search
// TODO clearing doesn't work
// TODO null value in search URL
export function ListPickerConnected(props: ListPickerConnectedProps) {
  const dispatch = useDispatch();
  const { value, parameter, onChange, forceSearchItemCount } = props;

  const [hasMoreValues, setHasMoreValues] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [values, setValues] = useState<string[]>([]);

  useDeepCompareEffect(() => {
    // console.log("PARAMETER CHANGE", parameter);
    setValues([]);
    setHasMoreValues(true);
  }, [parameter]);

  const fetchValues = useCallback(
    async (query: string) => {
      // console.log("fetch", query);
      setValues([]);
      setIsLoading(true);
      // await new Promise(res => setTimeout(res, 1000));
      const res = await dispatch(fetchParameterValues({ parameter, query }));
      // TODO WHY?
      setValues(res.values.flat(1) as string[]);
      setHasMoreValues(res.has_more_values);
      setIsLoading(false);
    },
    [dispatch, parameter],
  );

  const onSearch = useCallback(
    (query: string) => {
      if (!hasMoreValues) {
        // console.log("search NO MORE values");
        return;
      }

      const trimmed = query.trim();
      // console.log(`search trimmed="${trimmed}" value="${value}"`);
      // We have to trigger fecth only when search is different from the current value
      if (trimmed !== value) {
        fetchValues(trimmed);
      }
    },
    [value, fetchValues, hasMoreValues],
  );

  const onClearValue = () => {
    setHasMoreValues(true);
    setValues([]);
    onChange(null);
  };

  const staticValues = getListParameterStaticValues(parameter);
  const enableSearch =
    !staticValues || staticValues.length > forceSearchItemCount;

  return (
    <ListPicker
      value={value}
      values={staticValues ?? values}
      onClear={onClearValue}
      onChange={onChange}
      // TODO This is triggered on initial load before opening the dropdown
      onSearchChange={staticValues ? undefined : onSearch}
      enableSearch={enableSearch}
      placeholder={
        enableSearch ? t`Start typing to filter…` : t`Select a default value…`
      }
      isLoading={isLoading}
      noResultsText={isLoading ? t`Loading…` : t`No matching result`}
    />
  );
}
