import type {
  MultiSelectProps,
  SelectItemProps,
  SelectItem,
} from "@mantine/core";
import { MultiSelect, Tooltip } from "@mantine/core";
import { useUncontrolled } from "@mantine/hooks";
import type { ClipboardEvent, FocusEvent, ReactNode } from "react";
import { useMemo, useState, forwardRef } from "react";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

import { parseValues, unique } from "./utils";

export type MultiAutocompleteProps = Omit<
  MultiSelectProps,
  "shouldCreate" | "data"
> & {
  data?: (string | SelectItem)[];
  shouldCreate?: (value: string, selectedValues: string[]) => boolean;
  renderValue?: (value: string) => ReactNode;
};

export function MultiAutocomplete({
  data = [],
  value: controlledValue,
  defaultValue,
  searchValue: controlledSearchValue,
  placeholder,
  autoFocus,
  shouldCreate = defaultShouldCreate,
  onChange,
  onSearchChange,
  onFocus,
  onBlur,
  prefix,
  filter = defaultFilter,
  renderValue,
  ...props
}: MultiAutocompleteProps) {
  const [selectedValues, setSelectedValues] = useUncontrolled<string[]>({
    value: controlledValue,
    defaultValue,
    finalValue: [],
    onChange,
  });
  const [searchValue, setSearchValue] = useUncontrolled({
    value: controlledSearchValue,
    finalValue: "",
    onChange: onSearchChange,
  });

  const [lastSelectedValues, setLastSelectedValues] =
    useState<string[]>(selectedValues);

  const [isFocused, setIsFocused] = useState(false);
  const visibleValues = isFocused ? lastSelectedValues : [...selectedValues];

  const items = useMemo(
    () => getAvailableSelectItems(data, lastSelectedValues),
    [data, lastSelectedValues],
  );

  const handleChange = (newValues: string[]) => {
    const values = unique(newValues);
    setSelectedValues(values);
    setLastSelectedValues(values);
  };

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    setLastSelectedValues(selectedValues);
    onFocus?.(event);
  };

  function isValid(value: string | null) {
    return (
      value !== null &&
      value !== "" &&
      !Number.isNaN(value) &&
      shouldCreate?.(value, lastSelectedValues)
    );
  }

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);

    const values = parseValues(searchValue);
    const validValues = values.filter(isValid);

    setSearchValue("");

    if (validValues.length > 0) {
      const newValues = unique([...lastSelectedValues, ...validValues]);
      setSelectedValues(newValues);
      setLastSelectedValues(newValues);
    } else {
      setSelectedValues(lastSelectedValues);
    }

    onBlur?.(event);
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();

    const input = event.target as HTMLInputElement;
    const value = input.value;
    const before = value.slice(0, input.selectionStart ?? value.length);
    const after = value.slice(input.selectionEnd ?? value.length);

    const pasted = event.clipboardData.getData("text");
    const text = `${before}${pasted}${after}`;

    const values = parseValues(text);
    const validValues = values.filter(isValid);

    if (values.length > 0) {
      const newValues = unique([...lastSelectedValues, ...validValues]);
      setSelectedValues(newValues);
      setLastSelectedValues(newValues);
      setSearchValue("");
    } else {
      setSearchValue(text);
    }
  };

  const handleSearchChange = (newSearchValue: string) => {
    const first = newSearchValue.at(0);
    const last = newSearchValue.at(-1);

    setSearchValue(newSearchValue);

    if (newSearchValue !== "") {
      const values = parseValues(newSearchValue);
      if (values.length >= 1) {
        const value = values[0];
        if (isValid(value)) {
          setSelectedValues(unique([...lastSelectedValues, value]));
        }
      }
    }
    if (newSearchValue === "") {
      setSelectedValues(unique([...lastSelectedValues]));
    }

    const quotes = Array.from(newSearchValue).filter(ch => ch === '"').length;

    if (
      (last === "," && quotes % 2 === 0) ||
      last === "\t" ||
      last === "\n" ||
      (first === '"' && last === '"')
    ) {
      const values = parseValues(newSearchValue);
      const validValues = values.filter(isValid);

      if (values.length > 0) {
        setSearchValue("");
      }

      if (validValues.length > 0) {
        const newValues = unique([...lastSelectedValues, ...validValues]);
        setSelectedValues(newValues);
        setLastSelectedValues(newValues);
        setSearchValue("");
      }
    }
  };

  const info = isFocused ? (
    <Tooltip
      label={
        <>
          {t`Separate values with commas, tabs or newlines.`}
          <br />
          {t` Use double quotes for values containing commas.`}
        </>
      }
    >
      <Icon name="info_filled" fill={color("text-light")} />
    </Tooltip>
  ) : (
    <span />
  );

  const CustomItemComponent = useMemo(
    () =>
      forwardRef<HTMLDivElement, SelectItemProps>(function CustomItem(
        props,
        ref,
      ) {
        const customLabel =
          props.value !== undefined && renderValue?.(props.value);
        return (
          <ItemWrapper
            ref={ref}
            {...props}
            label={customLabel ?? props.label}
          />
        );
      }),
    [renderValue],
  );

  return (
    <MultiSelect
      {...props}
      data={items}
      value={visibleValues}
      searchValue={searchValue}
      placeholder={placeholder}
      searchable
      autoFocus={autoFocus}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onSearchChange={handleSearchChange}
      onPaste={handlePaste}
      rightSection={info}
      icon={prefix && <span data-testid="input-prefix">{prefix}</span>}
      filter={filter}
      itemComponent={CustomItemComponent}
    />
  );
}

function getSelectItem(item: string | SelectItem): SelectItem {
  if (typeof item === "string") {
    return { value: item, label: item };
  }

  if (!item.label) {
    return { value: item.value, label: item.value?.toString() ?? "" };
  }

  return item;
}

function getAvailableSelectItems(
  data: ReadonlyArray<string | SelectItem>,
  selectedValues: string[],
) {
  const all = [...data, ...selectedValues].map(getSelectItem);
  const seen = new Set();

  // Deduplicate items based on value
  return all.filter(function (option) {
    if (seen.has(option.value)) {
      return false;
    }
    seen.add(option.value);
    return true;
  });
}

function defaultShouldCreate(value: string, selectedValues: string[]) {
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return !selectedValues.some(selectedValue => selectedValue === value);
  }

  return (
    value.trim().length > 0 &&
    !selectedValues.some(selectedValue => selectedValue === value)
  );
}

function defaultFilter(
  query: string,
  selected: boolean,
  item: SelectItem,
): boolean {
  if (selected || !item.label) {
    return false;
  }
  return item.label.toLowerCase().trim().includes(query.toLowerCase().trim());
}

export const ItemWrapper = forwardRef<HTMLDivElement, SelectItemProps>(
  function ItemWrapper({ label, value, ...others }, ref) {
    return (
      <div ref={ref} {...others}>
        {label || value}
      </div>
    );
  },
);
