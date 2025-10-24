import { useDisclosure } from "@mantine/hooks";
import { useDeferredValue, useState } from "react";
import { t } from "ttag";

import { Button, Group, Icon, Input, Popover, Stack, rem } from "metabase/ui";

import type { RouteParams } from "../../../types";
import type { ChangeOptions, TreePath } from "../types";

import { FilterPopover, type FilterState } from "./FilterPopover";
import { SearchNew } from "./SearchNew";
import { Tree } from "./Tree";

interface TablePickerProps {
  params: RouteParams;
  path: TreePath;
  className?: string;
  onChange: (path: TreePath, options?: ChangeOptions) => void;
}

export function TablePicker({
  params,
  path,
  className,
  onChange,
}: TablePickerProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [filters, setFilters] = useState<FilterState>({
    visibilityType: null,
    visibilityType2: null,
    dataSource: null,
    ownerEmail: null,
    ownerUserId: null,
  });
  const [isOpen, { toggle, close }] = useDisclosure();
  const filtersCount = getFiltersCount(filters);

  return (
    <Stack data-testid="table-picker" mih={rem(200)} className={className}>
      <Group gap="md" p="xl" pb={0}>
        <Input
          flex="1"
          leftSection={<Icon name="search" />}
          placeholder={t`Search (use * as a wildcard)`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <Popover width={rem(300)} position="bottom-start" opened={isOpen}>
          <Popover.Target>
            <Button leftSection={<Icon name="filter" />} onClick={toggle}>
              {filtersCount === 0 ? t`Filter` : t`Filter (${filtersCount})`}
            </Button>
          </Popover.Target>

          <Popover.Dropdown>
            <FilterPopover
              filters={filters}
              onClose={close}
              onSubmit={(newFilters) => {
                setFilters(newFilters);
                close();
              }}
            />
          </Popover.Dropdown>
        </Popover>
      </Group>

      {deferredQuery === "" && filtersCount === 0 ? (
        <Tree path={path} onChange={onChange} />
      ) : (
        <SearchNew query={deferredQuery} params={params} filters={filters} />
      )}
    </Stack>
  );
}

function getFiltersCount(filters: FilterState): number {
  let count = 0;

  if (filters.dataSource != null) {
    ++count;
  }

  if (filters.visibilityType2 != null) {
    ++count;
  }

  if (filters.ownerEmail != null || filters.ownerUserId != null) {
    ++count;
  }

  return count;
}
