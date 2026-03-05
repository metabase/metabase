import { useDisclosure } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";

import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  Icon,
  Input,
  Popover,
  Stack,
  Tooltip,
  rem,
} from "metabase/ui";

import { useSelection } from "../../../pages/DataModel/contexts/SelectionContext";
import type { RouteParams } from "../../../pages/DataModel/types";
import type { ChangeOptions, FilterState, TreePath } from "../types";
import { getFiltersCount } from "../utils";

import { FilterPopover } from "./FilterPopover";
import { SearchNew } from "./SearchNew";
import S from "./TablePicker.module.css";
import { Tree } from "./Tree";

interface TablePickerProps {
  params: RouteParams;
  path: TreePath;
  className?: string;
  onChange: (path: TreePath, options?: ChangeOptions) => void;
  setOnUpdateCallback: (callback: (() => void) | null) => void;
}

export function TablePicker({
  params,
  path,
  className,
  onChange,
  setOnUpdateCallback,
}: TablePickerProps) {
  const { resetSelection } = useSelection();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_DURATION);
  const previousDebouncedQuery = usePrevious(debouncedQuery);
  const [filters, setFilters] = useState<FilterState>({
    dataLayer: null,
    dataSource: null,
    ownerEmail: null,
    ownerUserId: null,
    unusedOnly: null,
  });
  const [isOpen, { toggle, close }] = useDisclosure();
  const filtersCount = getFiltersCount(filters);

  const isLibraryEnabled = PLUGIN_LIBRARY.isEnabled;

  useEffect(() => {
    const togglingBetweenSearchAndTree =
      (previousDebouncedQuery === "" && debouncedQuery !== "") ||
      (previousDebouncedQuery !== "" && debouncedQuery === "");
    if (togglingBetweenSearchAndTree) {
      resetSelection();
    }
  }, [debouncedQuery, previousDebouncedQuery, resetSelection]);

  return (
    <Stack
      data-testid="table-picker"
      mih={rem(200)}
      className={className}
      style={{ overflow: "hidden" }}
    >
      <Group gap="sm">
        <Input
          flex="1"
          leftSection={<Icon name="search" />}
          placeholder={t`Search tables`}
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

        <Popover
          width={rem(340)}
          position="bottom-start"
          opened={isOpen}
          onChange={toggle}
        >
          <Popover.Target>
            <Tooltip label={t`Filter`} disabled={isOpen}>
              <Button
                aria-label={t`Filter`}
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
              onSubmit={(newFilters) => {
                setFilters(newFilters);
                close();
              }}
            />
          </Popover.Dropdown>
        </Popover>
      </Group>

      <Box mih={0} flex="0 1 auto" display="flex" className={S.treeContainer}>
        <Card withBorder p={0} flex={1} mih={0} display="flex">
          {debouncedQuery === "" && filtersCount === 0 ? (
            <Tree
              path={path}
              isLibraryEnabled={isLibraryEnabled}
              onChange={onChange}
              setOnUpdateCallback={setOnUpdateCallback}
            />
          ) : (
            <SearchNew
              query={debouncedQuery}
              params={params}
              isLibraryEnabled={isLibraryEnabled}
              filters={filters}
              onChange={onChange}
            />
          )}
        </Card>
      </Box>
    </Stack>
  );
}
