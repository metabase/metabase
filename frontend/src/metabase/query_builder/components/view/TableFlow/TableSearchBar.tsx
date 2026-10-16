import { t } from "ttag";

import { Icon, TextInput } from "metabase/ui";

import S from "./TableFlow.module.css";

type TableSearchBarProps = {
  searchText: string;
  onSearchTextChange: (searchText: string) => void;
};

export function TableSearchBar({
  searchText,
  onSearchTextChange,
}: TableSearchBarProps) {
  return (
    <div className={S.searchBar}>
      <TextInput
        classNames={{ input: S.searchInput }}
        variant="unstyled"
        value={searchText}
        placeholder={t`Search this table…`}
        leftSection={<Icon name="search" />}
        aria-label={t`Search this table`}
        onChange={(event) => onSearchTextChange(event.currentTarget.value)}
      />
    </div>
  );
}
