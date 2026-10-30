import { useRef, useState } from "react";
import { t } from "ttag";

import { Icon, TextInput } from "metabase/ui";

import S from "./TableFlow.module.css";

type TableSearchProps = {
  searchText: string;
  onSearchTextChange: (searchText: string) => void;
  /** Shrinks the search to its icon until focused, leaving room for filter pills. */
  isCollapsed: boolean;
};

/**
 * Row search for a table. The input is always mounted, so collapsing and expanding only
 * animates its width and never changes the row's height.
 */
export function TableSearch({
  searchText,
  onSearchTextChange,
  isCollapsed,
}: TableSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const isOpen = !isCollapsed || isFocused || searchText !== "";

  return (
    <div
      className={S.searchField}
      data-open={isOpen}
      onClick={() => inputRef.current?.focus()}
    >
      <TextInput
        ref={inputRef}
        classNames={{ input: S.searchInput }}
        variant="unstyled"
        value={searchText}
        placeholder={t`Search this table…`}
        leftSection={<Icon name="search" />}
        aria-label={t`Search this table`}
        onChange={(event) => onSearchTextChange(event.currentTarget.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      />
    </div>
  );
}
