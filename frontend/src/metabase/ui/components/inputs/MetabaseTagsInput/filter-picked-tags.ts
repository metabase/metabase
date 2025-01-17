import { type ComboboxParsedItem, isOptionsGroup } from "@mantine/core";

interface FilterPickedTagsInput {
  data: ComboboxParsedItem[];
  value: string[];
}

export function filterPickedTags({ data, value }: FilterPickedTagsInput) {
  const normalizedValue = value.map(item => item.trim().toLowerCase());

  const filtered = data.reduce<ComboboxParsedItem[]>((acc, item) => {
    if (isOptionsGroup(item)) {
      acc.push({
        group: item.group,
        items: item.items.filter(
          option =>
            normalizedValue.indexOf(option.value.toLowerCase().trim()) === -1,
        ),
      });
    } else if (
      normalizedValue.indexOf(item.value.toLowerCase().trim()) === -1
    ) {
      acc.push(item);
    }

    return acc;
  }, []);

  return filtered;
}
