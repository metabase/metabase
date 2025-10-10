import type { FilterOption } from "../../types";

export type FilterItem = {
  value: FilterOption;
  label: string;
};

export type FilterGroupItem = {
  label: string;
  items: FilterItem[];
};
