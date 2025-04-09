import {
  Box,
  CheckIcon,
  Combobox,
  type ComboboxFactory,
  type ComboboxItem,
  type ComboboxLikeRenderOptionInput,
  type OptionsFilter,
  ScrollArea,
  type ScrollAreaProps,
  defaultOptionsFilter,
  isOptionsGroup,
  useStyles,
} from "@mantine/core";
import type { ReactNode } from "react";

export interface ComboboxParsedItemGroup {
  group: string;
  items: ComboboxItem[];
}

export type OptionsData = (ComboboxItem | ComboboxParsedItemGroup)[];

interface OptionProps {
  data: ComboboxItem | ComboboxParsedItemGroup;
  withCheckIcon?: boolean;
  value?: string | string[] | null;
  checkIconPosition?: "left" | "right";
  unstyled: boolean | undefined;
  renderOption?: (
    input: ComboboxLikeRenderOptionInput<ComboboxItem>,
  ) => ReactNode;
}

function isValueChecked(
  value: string | string[] | undefined | null,
  optionValue: string,
) {
  return Array.isArray(value)
    ? value.includes(optionValue)
    : value === optionValue;
}

function Option({
  data,
  withCheckIcon,
  value,
  checkIconPosition,
  unstyled,
  renderOption,
}: OptionProps) {
  if (!isOptionsGroup(data)) {
    const checked = isValueChecked(value, data.value);
    const check = withCheckIcon && checked && <CheckIcon />;

    const defaultContent = (
      <>
        {checkIconPosition === "left" && check}
        <span>{data.label}</span>
        {checkIconPosition === "right" && check}
      </>
    );

    return (
      <Combobox.Option
        value={data.value}
        disabled={data.disabled}
        data-reverse={checkIconPosition === "right" || undefined}
        data-checked={checked || undefined}
        aria-selected={checked}
        active={checked}
      >
        {typeof renderOption === "function"
          ? renderOption({ option: data, checked })
          : defaultContent}
      </Combobox.Option>
    );
  }

  const options = data.items.map((item) => (
    <Option
      data={item}
      value={value}
      key={item.value}
      unstyled={unstyled}
      withCheckIcon={withCheckIcon}
      checkIconPosition={checkIconPosition}
      renderOption={renderOption}
    />
  ));

  return <Combobox.Group label={data.group}>{options}</Combobox.Group>;
}

export interface OptionsDropdownProps {
  data: OptionsData;
  filter: OptionsFilter | undefined;
  search: string | undefined;
  limit: number | undefined;
  withScrollArea: boolean | undefined;
  maxDropdownHeight: number | string | undefined;
  hidden?: boolean;
  hiddenWhenEmpty?: boolean;
  filterOptions?: boolean;
  withCheckIcon?: boolean;
  value?: string | string[] | null;
  checkIconPosition?: "left" | "right";
  nothingFoundMessage?: React.ReactNode;
  unstyled: boolean | undefined;
  labelId: string | undefined;
  "aria-label": string | undefined;
  renderOption?: (input: ComboboxLikeRenderOptionInput<any>) => React.ReactNode;
  scrollAreaProps: ScrollAreaProps | undefined;
}

export function OptionsDropdown({
  data,
  hidden,
  hiddenWhenEmpty,
  filter,
  search,
  limit,
  maxDropdownHeight,
  withScrollArea = true,
  filterOptions = true,
  withCheckIcon = false,
  value,
  checkIconPosition,
  nothingFoundMessage,
  unstyled,
  labelId,
  renderOption,
  scrollAreaProps,
  "aria-label": ariaLabel,
}: OptionsDropdownProps) {
  const getStyles = useStyles<ComboboxFactory>({
    name: "Combobox",
    props: {},
    classes: {},
    unstyled,
  });
  const shouldFilter = typeof search === "string";
  const filteredData = shouldFilter
    ? (filter || defaultOptionsFilter)({
        options: data,
        search: filterOptions ? search : "",
        limit: limit ?? Infinity,
      })
    : data;
  const isEmpty = filteredData.length === 0;

  const options = filteredData.map((item) => (
    <Option
      data={item}
      key={isOptionsGroup(item) ? item.group : item.value}
      withCheckIcon={withCheckIcon}
      value={value}
      checkIconPosition={checkIconPosition}
      unstyled={unstyled}
      renderOption={renderOption}
    />
  ));

  const content = (
    <Combobox.Options labelledBy={labelId} aria-label={ariaLabel}>
      {withScrollArea ? (
        <ScrollArea.Autosize
          mah={maxDropdownHeight ?? 220}
          type="scroll"
          scrollbarSize="var(--combobox-padding)"
          offsetScrollbars="y"
          {...scrollAreaProps}
        >
          {options}
        </ScrollArea.Autosize>
      ) : (
        options
      )}
      {isEmpty && nothingFoundMessage && (
        <Combobox.Empty>{nothingFoundMessage}</Combobox.Empty>
      )}
    </Combobox.Options>
  );

  if (hidden || (hiddenWhenEmpty && isEmpty)) {
    return null;
  }

  return <Box {...getStyles("dropdown")}>{content}</Box>;
}
