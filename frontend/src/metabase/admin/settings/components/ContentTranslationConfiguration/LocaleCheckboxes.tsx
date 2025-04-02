import type { Dispatch, SetStateAction } from "react";

import {
  Checkbox,
  type ComboboxItem,
  Stack,
  type StackProps,
} from "metabase/ui";

export const LocaleCheckboxes = ({
  setSelectedLocales,
  selectedLocales,
  availableLocales,
  ...stackProps
}: {
  setSelectedLocales: Dispatch<SetStateAction<string[]>>;
  selectedLocales: string[];
  availableLocales: ComboboxItem[];
} & StackProps) => {
  return (
    <Stack gap="md" {...stackProps}>
      {availableLocales.map(locale => {
        const checked = selectedLocales.includes(locale.value);
        return (
          <Checkbox
            key={locale.value}
            checked={checked}
            onChange={() => {
              setSelectedLocales(selectedLocales => {
                if (checked) {
                  return selectedLocales.filter(l => l !== locale.value);
                } else {
                  return [...selectedLocales, locale.value];
                }
              });
            }}
            label={locale.label}
          />
        );
      })}
    </Stack>
  );
};
