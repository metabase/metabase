import { useDisclosure } from "@mantine/hooks";
import { useDeferredValue, useEffect, useState } from "react";
import { usePrevious } from "react-use";
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

import { useDataModelApi } from "../../../pages/DataModel/contexts/DataModelApiContext";
import { useSelection } from "../../../pages/DataModel/contexts/SelectionContext";
import type { RouteParams } from "../../../pages/DataModel/types";
import type { ChangeOptions, FilterState, TreePath } from "../types";
import { getFiltersCount } from "../utils";

import { FilterPopover } from "./FilterPopover";
import { PublishModelsModal } from "./PublishModelsModal";
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
  const { selectedTables, selectedSchemas, selectedDatabases, resetSelection } =
    useSelection();
  const { invokeAction } = useDataModelApi();

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const previousDeferredQuery = usePrevious(deferredQuery);
  const [filters, setFilters] = useState<FilterState>({
    dataLayer: null,
    dataSource: null,
    ownerEmail: null,
    ownerUserId: null,
    unusedOnly: null,
  });
  const [isOpen, { toggle, close }] = useDisclosure();
  const filtersCount = getFiltersCount(filters);

  const [isCreateModelsModalOpen, setIsCreateModelsModalOpen] = useState(false);

  const handlePublishSuccess = () => {
    invokeAction("refetchFilteredTables");
    invokeAction("refetchSelectedTables");
    resetSelection();
  };

  useEffect(() => {
    const togglingBetweenSearchAndTree =
      (previousDeferredQuery === "" && deferredQuery !== "") ||
      (previousDeferredQuery !== "" && deferredQuery === "");
    if (togglingBetweenSearchAndTree) {
      resetSelection();
    }
  }, [deferredQuery, previousDeferredQuery, resetSelection]);

  return (
    <Stack
      data-testid="table-picker"
      mih={rem(200)}
      className={className}
      style={{ overflow: "hidden" }}
    >
      <Group gap="sm" p="lg" pb={0}>
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

        <Popover width={rem(340)} position="bottom-start" opened={isOpen}>
          <Popover.Target>
            <Tooltip label={t`Filter`}>
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

      <Box mih={0} flex="1 1 auto">
        {deferredQuery === "" && filtersCount === 0 ? (
          <Tree path={path} onChange={onChange} />
        ) : (
          <SearchNew query={deferredQuery} params={params} filters={filters} />
        )}
      </Box>

      <PublishModelsModal
        tables={selectedTables}
        schemas={selectedSchemas}
        databases={selectedDatabases}
        isOpen={isCreateModelsModalOpen}
        onClose={() => setIsCreateModelsModalOpen(false)}
        onSuccess={handlePublishSuccess}
      />
    </Stack>
  );
}
