import { useDisclosure } from "@mantine/hooks";
import { useDeferredValue, useState } from "react";
import { t } from "ttag";

import {
  Badge,
  Box,
  Button,
  Group,
  Icon,
  Input,
  Popover,
  Stack,
  Tooltip,
  rem,
} from "metabase/ui";

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
    <Stack
      data-testid="table-picker"
      mih={rem(200)}
      className={className}
      style={{ overflow: "hidden" }}
    >
      <Group gap="md" p="lg" pb={0}>
        <Input
          flex="1"
          leftSection={<Icon name="search" />}
          placeholder={t`Search tables and models`}
          rightSection={
            <Tooltip
              label={
                <Box ta="center">
                  <div>{t`Search matches from the start of words.`}</div>
                  <div>{t`Use * as a wildcard.`}</div>
                </Box>
              }
            >
              <Icon name="info" />
            </Tooltip>
          }
          rightSectionPointerEvents="auto"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <Popover width={rem(300)} position="bottom-start" opened={isOpen}>
          <Popover.Target>
            <Tooltip label={t`Filter`}>
              <Button
                leftSection={
                  <Box pos="relative">
                    <Icon name="filter" />

                    {filtersCount > 0 && (
                      <Badge
                        bg="brand"
                        circle
                        size="8"
                        pos="absolute"
                        top={-6}
                        right={-8}
                      />
                    )}
                  </Box>
                }
                onClick={toggle}
              />
            </Tooltip>
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

      <Box style={{ overflow: "auto" }}>
        {deferredQuery === "" && filtersCount === 0 ? (
          <Tree path={path} onChange={onChange} />
        ) : (
          <SearchNew query={deferredQuery} params={params} filters={filters} />
        )}
      </Box>
    </Stack>
  );
}

function getFiltersCount(filters: FilterState): number {
  let count = 0;

  if (filters.visibilityType != null) {
    ++count;
  }

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
