import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import { ActionIcon, Icon, TextInput, Tooltip } from "metabase/ui";

import S from "./TableFlow.module.css";

type TableSearchProps = {
  searchText: string;
  onSearchTextChange: (searchText: string) => void;
  /** Shrinks the search to an icon until clicked, leaving room for filter pills. */
  isCollapsed: boolean;
};

export function TableSearch({
  searchText,
  onSearchTextChange,
  isCollapsed,
}: TableSearchProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (isCollapsed && !isExpanded && searchText === "") {
    return (
      <Tooltip label={t`Search this table`}>
        <ActionIcon
          variant="viewHeader"
          aria-label={t`Search this table`}
          onClick={() => setIsExpanded(true)}
        >
          <Icon name="search" />
        </ActionIcon>
      </Tooltip>
    );
  }

  return (
    <TextInput
      className={cx(S.searchField, { [S.searchFieldCompact]: isCollapsed })}
      classNames={{ input: S.searchInput }}
      variant="unstyled"
      value={searchText}
      placeholder={t`Search this table…`}
      leftSection={<Icon name="search" />}
      aria-label={t`Search this table`}
      autoFocus={isCollapsed}
      onChange={(event) => onSearchTextChange(event.currentTarget.value)}
      onBlur={() => setIsExpanded(false)}
    />
  );
}
