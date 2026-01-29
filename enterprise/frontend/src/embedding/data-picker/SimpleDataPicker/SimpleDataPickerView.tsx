import { useState } from "react";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { useTranslateContent } from "metabase/i18n/hooks";
import { CONTAINER_WIDTH } from "metabase/query_builder/components/DataSelector/constants";
import { Flex, Icon, NavLink, Paper, ScrollArea, TextInput } from "metabase/ui";
import type { TableId } from "metabase-types/api";

interface SimpleDataPickerProps {
  selectedEntity?: TableId;
  options: Options[];
  onClick: (tableId: TableId) => void;
}

interface Options {
  id: TableId;
  name: string;
}

const TEN_OPTIONS_HEIGHT = 10 * 33;

export function SimpleDataPickerView({
  selectedEntity,
  options,
  onClick,
}: SimpleDataPickerProps) {
  const tc = useTranslateContent();
  const shouldShowSearchBar = options.length > 10;
  const [searchText, setSearchText] = useState("");
  function filterSearch(option: Options): boolean {
    if (searchText) {
      return normalizeString(option.name).includes(normalizeString(searchText));
    }

    return true;
  }

  if (options.length === 0) {
    return (
      <Paper w={CONTAINER_WIDTH} px="3.75rem" py="1rem">
        <EmptyState
          message={t`To pick some data, you'll need to add some first`}
          icon="database"
        />
      </Paper>
    );
  }

  const displayOptions = options.filter(filterSearch);
  return (
    <Flex component={Paper} w={CONTAINER_WIDTH} p="sm" direction="column">
      {shouldShowSearchBar ? (
        <TextInput
          data-autofocus
          type="search"
          leftSection={<Icon name="search" size={16} aria-hidden />}
          mb="sm"
          placeholder={t`Search…`}
          onChange={(e) => setSearchText(e.target.value ?? "")}
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
      <Flex direction="column" justify="center" style={{ flex: 1 }}>
        {displayOptions.length >= 1 ? (
          <ScrollArea.Autosize mah={TEN_OPTIONS_HEIGHT} type="auto" mb="auto">
            {displayOptions.map((option) => {
              const isSelected = selectedEntity === option.id;
              const iconColor = isSelected
                ? "text-primary-inverse"
                : "icon-primary";
              return (
                <NavLink
                  key={option.id}
                  active={selectedEntity === option.id}
                  leftSection={<Icon c={iconColor} name="table" aria-hidden />}
                  label={tc(option.name)}
                  onClick={() => onClick(option.id)}
                  variant="default"
                />
              );
            })}
          </ScrollArea.Autosize>
        ) : (
          <EmptyState message={t`Nothing here`} />
        )}
      </Flex>
    </Flex>
  );
}

function normalizeString(input: string) {
  return input.trim().toLowerCase();
}
