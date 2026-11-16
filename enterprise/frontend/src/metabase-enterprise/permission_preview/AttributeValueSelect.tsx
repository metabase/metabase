import { msgid, ngettext, t } from "ttag";

import { Select } from "metabase/ui";

import type { PreviewAttribute } from "./api";

// Mantine's Select can't hold an empty string as a value, and the backend reads "" as no value
const NO_VALUE = "__no_value__";

type AttributeValueSelectProps = {
  attribute: PreviewAttribute;
  value: string;
  onChange: (value: string) => void;
  size?: "xs" | "sm";
  /** Off inside a popover, so picking an option doesn't count as a click outside it. */
  withinPortal?: boolean;
};

/**
 * Picks the value of one attribute a group preview runs with: values the group's members have
 * first, with how many have each, then the other values the filtered column or router offers.
 */
export function AttributeValueSelect({
  attribute,
  value,
  onChange,
  size = "sm",
  withinPortal = true,
}: AttributeValueSelectProps) {
  const data = [
    {
      group: t`Used by members`,
      items: attribute.member_values.map((memberValue) => ({
        value: memberValue.value,
        label: `${memberValue.value} (${getMemberCount(memberValue.count)})`,
      })),
    },
    {
      group: t`Other values`,
      items: attribute.other_values.map((otherValue) => ({
        value: otherValue,
        label: otherValue,
      })),
    },
    {
      group: t`None`,
      items: [{ value: NO_VALUE, label: t`No value` }],
    },
  ].filter((group) => group.items.length > 0);

  return (
    <Select
      aria-label={attribute.attribute}
      size={size}
      searchable
      comboboxProps={{ withinPortal }}
      data={data}
      value={value === "" ? NO_VALUE : value}
      onChange={(newValue) =>
        onChange(newValue == null || newValue === NO_VALUE ? "" : newValue)
      }
    />
  );
}

function getMemberCount(count: number) {
  return ngettext(msgid`${count} member`, `${count} members`, count);
}

/** Each attribute's value: the admin's pick, else the backend's default. */
export function getAttributeValues(
  attributes: PreviewAttribute[],
  picked: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    attributes.map((attribute) => [
      attribute.attribute,
      picked[attribute.attribute] ?? attribute.default ?? "",
    ]),
  );
}
