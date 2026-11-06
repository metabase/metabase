import { useState } from "react";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { useTranslateContent } from "metabase/content-translation/hooks";
import type { DataSource } from "metabase/embedding-sdk/types/components/data-picker";
import { CONTAINER_WIDTH } from "metabase/querying/common/components/DataSelector/constants";
import { Flex, Icon, NavLink, Paper, ScrollArea, TextInput } from "metabase/ui";

interface SimpleDataPickerProps {
  selectedSource?: DataSource;
  options: Options[];
  onClick: (source: DataSource) => void;
}

interface Options {
  source: DataSource;
  name: string;
}

const TEN_OPTIONS_HEIGHT = 10 * 33;

export function SimpleDataPickerView({
  selectedSource,
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
              const isSelected =
                selectedSource?.type === option.source.type &&
                selectedSource.id === option.source.id;
              const iconColor = isSelected
                ? "text-primary-inverse"
                : "icon-brand";
              return (
                <NavLink
                  key={`${option.source.type}:${option.source.id}`}
                  active={isSelected}
                  leftSection={<Icon c={iconColor} name="table" aria-hidden />}
                  label={tc(option.name)}
                  onClick={() => onClick(option.source)}
                  variant="primary"
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
