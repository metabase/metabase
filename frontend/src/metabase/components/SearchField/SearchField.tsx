import classNames from "classnames";
import {
  type FocusEvent,
  type ReactElement,
  useMemo,
  useRef,
  useState,
} from "react";
import { t } from "ttag";
import _ from "underscore";

import EmptyState from "metabase/components/EmptyState";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { Box, Flex, MultiAutocomplete } from "metabase/ui";
import type { FieldValue, RowValue } from "metabase-types/api";

import S from "./SearchField.module.css";
import { isValidOptionItem } from "./utils";

const DEBOUNCE_FILTER_TIME = 100;

type SelectItem = {
  value: string;
  label?: string;
};

type SearchFieldProps = {
  onChange: (values: RowValue[]) => void;
  onInputChange: (query: string) => void;
  value: RowValue[];
  options: FieldValue[];
  placeholder?: string;
  shouldCreate?: (value: RowValue) => boolean;
  autoFocus?: boolean;
  prefix?: string;
  isDashboardFilter?: boolean;
  optionRenderer: (option: FieldValue) => ReactElement;
  itemRenderer: (option: FieldValue) => SelectItem;
  isLoading?: boolean;
};

export const SearchField = ({
  onChange,
  onInputChange,
  value,
  options,
  placeholder,
  shouldCreate,
  autoFocus = false,
  prefix,
  isDashboardFilter = false,
  optionRenderer,
  itemRenderer,
  isLoading = false,
}: SearchFieldProps) => {
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLUListElement>(null);

  const handleSearchChange = (query: string) => {
    setQuery(query);
    if (query !== "") {
      onInputChange(query);
    }
  };

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    if (!ref.current) {
      return;
    }

    if (ref.current.contains(event.relatedTarget as Node)) {
      event.stopPropagation();
    }
  }

  const debouncedFilter = useDebouncedValue(query, DEBOUNCE_FILTER_TIME);

  const sortedOptions = useMemo(() => {
    const [selected, unselected] = _.partition(
      options,
      option => query === option[0],
    );

    return [...selected, ...unselected];
  }, [query, options]);

  const filteredOptions = useMemo(() => {
    const formattedFilter = debouncedFilter.trim().toLowerCase();
    if (formattedFilter.length === 0) {
      return sortedOptions;
    }

    return sortedOptions.filter(option => {
      if (!option) {
        return false;
      }

      // option as: [id, name]
      if (
        option.length > 1 &&
        option[1] &&
        isValidOptionItem(option[1], formattedFilter)
      ) {
        return true;
      }

      // option as: [id]
      return isValidOptionItem(option[0], formattedFilter);
    });
  }, [sortedOptions, debouncedFilter]);

  const shouldShowEmptyState =
    query.length > 0 && filteredOptions.length === 0 && !isLoading;

  return (
    <>
      <MultiAutocomplete
        data-testid="field-values-multi-autocomplete"
        onSearchChange={handleSearchChange}
        onChange={onChange}
        searchValue={query}
        value={value
          .map(value => value?.toString())
          .filter((v): v is string => v !== null && v !== undefined)}
        data={filteredOptions.map(itemRenderer)}
        placeholder={placeholder}
        shouldCreate={shouldCreate}
        autoFocus={autoFocus}
        icon={prefix && <span data-testid="input-prefix">{prefix}</span>}
        withinPortal
        dropdownComponent={NoDropdown}
        onBlur={handleBlur}
        styles={{
          dropdown: { display: "none" },
        }}
      />

      {shouldShowEmptyState && (
        <Box pt="lg">
          <EmptyState message={t`Didn't find anything`} icon="search" />
        </Box>
      )}

      {isLoading && (
        <Flex p="md" align="center" justify="center">
          <LoadingSpinner size={24} />
        </Flex>
      )}

      {!isLoading && (
        <ul
          ref={ref}
          className={classNames(
            S.options,
            isDashboardFilter && S.dashboardFilter,
          )}
        >
          {filteredOptions.map(function (option, index) {
            const isSelected = value.includes(option[0]);

            const handleClick = () => {
              if (isSelected) {
                setQuery("");
                onChange(value.filter(value => value !== option[0]));
              } else {
                setQuery("");
                onChange([...value, option[0]]);
              }
            };

            return (
              <li key={index}>
                <button
                  onClick={handleClick}
                  className={classNames(S.option, isSelected && S.selected)}
                >
                  {optionRenderer(option)}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
};

function NoDropdown() {
  return null;
}
