import { useState } from "react";
import { t } from "ttag";

import { Icon, NavLink, Paper, ScrollArea, TextInput } from "metabase/ui";

interface SimpleDataPickerProps {
  options: Options[];
  onClick: (option: any) => void;
}

interface Options {
  id: number;
  display_name: string;
}

const TEN_OPTIONS_HEIGHT = 10 * 33;

export function SimpleDataPicker({ options, onClick }: SimpleDataPickerProps) {
  const shouldShowSearchBar = options.length > 10;
  const [searchText, setSearchText] = useState("");
  function filterSearch(option: Options): boolean {
    if (searchText) {
      return normalizeString(option.display_name).includes(
        normalizeString(searchText),
      );
    }

    return true;
  }

  return (
    <Paper w="300px" p="sm">
      {shouldShowSearchBar ? (
        <TextInput
          data-autofocus
          type="search"
          icon={<Icon name="search" size={16} />}
          mb="sm"
          placeholder={t`Search…`}
          onChange={e => setSearchText(e.target.value ?? "")}
        />
      ) : (
        /**
         * Behave like Mantine 7's `FocusTrap.InitialFocus`.
         *
         * This component disable the automatic focus on the first focusable element
         * when there is no search bar.
         */
        <span aria-hidden data-autofocus tabIndex={-1} />
      )}
      {/* @ts-expect-error - I think the typing for ScrollArea.Autosize is wrong. This might be fixed in Mantine 7 */}
      <ScrollArea.Autosize mah={TEN_OPTIONS_HEIGHT} type="auto">
        {options.filter(filterSearch).map(option => {
          return (
            <NavLink
              key={option.id}
              icon={<Icon c="var(--mb-color-icon-primary)" name="table" />}
              label={option.display_name}
              onClick={() => {
                onClick(option);
              }}
              variant="default"
            />
          );
        })}
      </ScrollArea.Autosize>
    </Paper>
  );
}

function normalizeString(input: string) {
  return input.trim().toLowerCase();
}
