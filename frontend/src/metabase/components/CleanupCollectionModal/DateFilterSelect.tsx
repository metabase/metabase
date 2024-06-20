import { forwardRef } from "react";
import _ from "underscore";

import {
  Icon,
  Select,
  SelectItem,
  type SelectProps,
  type SelectItemProps,
} from "metabase/ui";

import { dateFilterOptions } from "./utils";

interface DateFilterSelectItemProps
  extends SelectItemProps,
    React.ComponentPropsWithoutRef<"div"> {
  optionLabel: string;
  value: string;
}

const DateFilterSelectItem = forwardRef<
  HTMLDivElement,
  DateFilterSelectItemProps
>(({ optionLabel, ...props }, ref) => (
  <SelectItem ref={ref} {...props} label={optionLabel} />
));

DateFilterSelectItem.displayName = "DateFilterSelectItem";

export const DateFilterSelect = (props: Omit<SelectProps, "data">) => (
  <Select
    icon={<Icon name="calendar" />}
    id="not-view-in-filter"
    {...props}
    data={dateFilterOptions}
    itemComponent={DateFilterSelectItem}
  />
);
