import type {
  ComboboxData,
  ComboboxItem,
  ComboboxItemGroup,
} from "@mantine/core";

export { Combobox } from "@mantine/core";
export type {
  ComboboxProps,
  ComboboxGroupProps,
  ComboboxItem,
  ComboboxItemGroup,
} from "@mantine/core";

// Labels are no longer optional in Mantine v7. This type supports backwards compatibility
export type ComboboxItemWithOptionalLabel = Partial<
  Pick<ComboboxItem, "label">
> &
  Omit<ComboboxItem, "label">;

export type ComboboxDataItem = ComboboxData[0];
export type LegacyComboboxDataItem =
  | string
  | ComboboxItem
  | ComboboxItemWithOptionalLabel;

export type LegacyComboboxData =
  | Array<LegacyComboboxDataItem>
  | ReadonlyArray<LegacyComboboxDataItem>;

export const isComboboxItemGroup = (
  item: ComboboxDataItem,
): item is ComboboxItemGroup => {
  const typedItem = item as ComboboxItemGroup;
  return (
    typedItem.group !== undefined &&
    typedItem.items !== undefined &&
    Array.isArray(typedItem.items)
  );
};

export const isComboboxItem = (
  item: ComboboxDataItem,
): item is ComboboxItem => {
  const typedItem = item as ComboboxItem;
  const { label, value } = typedItem;
  return (
    label !== undefined &&
    typedItem.value !== undefined &&
    typeof label === "string" &&
    typeof value === "string"
  );
};

export const isComboboxItemWithMissingLabel = (
  item:
    | string
    | ComboboxItem
    | ComboboxItemWithOptionalLabel
    | ComboboxItemGroup,
): item is ComboboxItemWithOptionalLabel => {
  const typedItem = item as ComboboxItem;
  const { label } = typedItem;
  return label !== undefined;
};

/** Convert a Mantine 6 ComboboxDataItem into a Mantine 7 one */
export const normalizeComboboxDataItem = (item: LegacyComboboxDataItem) =>
  isComboboxItemWithMissingLabel(item) ? { ...item, label: "" } : item;

export const normalizeComboboxData = (legacyData: LegacyComboboxData) =>
  legacyData?.map(item => normalizeComboboxDataItem(item));

// Legacy name
export type SelectItem = Exclude<ComboboxDataItem, ComboboxItemGroup | string>;
