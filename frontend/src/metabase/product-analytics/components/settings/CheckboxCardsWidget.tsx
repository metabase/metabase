import { Checkbox, Stack } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";

import type { SettingWidgetProps } from "../../settings/types";

export type CheckboxCardOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
  /** A palette color name, or a picked CSS color. */
  color?: ColorName | string;
};

type CheckboxCardsWidgetProps<T extends string> = SettingWidgetProps<T[]> & {
  options: readonly CheckboxCardOption<T>[];
};

/**
 * A card per option that can be toggled on and off. The value follows the
 * order of `options`.
 */
export const CheckboxCardsWidget = <T extends string>({
  id,
  value,
  onChange,
  options,
}: CheckboxCardsWidgetProps<T>) => (
  <Checkbox.Group
    id={id}
    value={value}
    onChange={(checked) =>
      onChange(
        options
          .filter((option) => checked.includes(option.value))
          .map((option) => option.value),
      )
    }
  >
    <Stack gap="sm">
      {options.map((option) => (
        <Checkbox.Card
          key={option.value}
          value={option.value}
          label={option.label}
          description={option.description}
          indicatorColor={option.color}
        />
      ))}
    </Stack>
  </Checkbox.Group>
);
