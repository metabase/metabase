import { useDisclosure } from "@mantine/hooks";
import { useDeferredValue, useEffect, useState } from "react";
import { Link } from "react-router";
import { usePrevious } from "react-use";
import { jt, t } from "ttag";

import {
  useListCollectionsTreeQuery,
  usePublishModelsMutation,
} from "metabase/api";
import { isSyncedCollection } from "metabase/collections/utils";
import { useToast } from "metabase/common/hooks";
import {
  Badge,
  Box,
  Button,
  Group,
  Icon,
  Input,
  Menu,
  Popover,
  Stack,
  Tooltip,
  rem,
} from "metabase/ui";
import type { CollectionId, DatabaseId, TableId } from "metabase-types/api";

import type { RouteParams } from "../../../types";
import type { ChangeOptions, TreePath } from "../types";
import { getFiltersCount } from "../utils";

import { EditTableMetadataModal } from "./EditTableMetadataModal";
import { FilterPopover, type FilterState } from "./FilterPopover";
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
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const previousDeferredQuery = usePrevious(deferredQuery);
  const [filters, setFilters] = useState<FilterState>({
    visibilityType2: null,
    dataSource: null,
    ownerEmail: null,
    ownerUserId: null,
    orphansOnly: null,
  });
  const [isOpen, { toggle, close }] = useDisclosure();
  const filtersCount = getFiltersCount(filters);

  const [selectedTables, setSelectedTables] = useState<Set<TableId>>(new Set());
  const [selectedSchemas, setSelectedSchemas] = useState<Set<string>>(
    new Set(),
  );
  const [selectedDatabases, setSelectedDatabases] = useState<Set<DatabaseId>>(
    new Set(),
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreateModelsModalOpen, setIsCreateModelsModalOpen] = useState(false);
  const [onUpdateCallback, setOnUpdateCallback] = useState<(() => void) | null>(
    null,
  );

  const hasSelectedItems =
    selectedTables.size > 0 ||
    selectedSchemas.size > 0 ||
    selectedDatabases.size > 0;

  function resetSelection() {
    setSelectedTables(new Set());
    setSelectedSchemas(new Set());
    setSelectedDatabases(new Set());
  }

  function handleModalUpdate() {
    if (onUpdateCallback) {
      onUpdateCallback();
    }
    resetSelection();
  }

  function handlePublishSuccess() {
    if (onUpdateCallback) {
      onUpdateCallback();
    }
    resetSelection();
  }

  useEffect(() => {
    if (previousDeferredQuery === "" && deferredQuery !== "") {
      resetSelection();
    }

    if (previousDeferredQuery !== "" && deferredQuery === "") {
      resetSelection();
    }
  }, [deferredQuery, previousDeferredQuery]);

  const { data: collections = [] } = useListCollectionsTreeQuery({
    "exclude-other-user-collections": true,
    "exclude-archived": true,
  });

  const [publishModels] = usePublishModelsMutation();
  const [sendToast] = useToast();
  const libraryId = collections.reduce<CollectionId | undefined>(
    (result, collection) => {
      if (result) {
        return result;
      }

      if (isSyncedCollection(collection) && collection.name === "Library") {
        return collection.id;
      }

      return result;
    },
    undefined,
  );

  const handlePublishModels = async () => {
    const { error } = await publishModels({
      table_ids: Array.from(selectedTables),
      schema_ids: Array.from(selectedSchemas),
      database_ids: Array.from(selectedDatabases),
      target_collection_id: "library",
    });

    if (error) {
      sendToast({
        message: t`Failed to publish`,
      });
    } else {
      sendToast({
        message: libraryId ? (
          <span>
            {jt`Tables published in ${(<Link key="link" to={`/collection/${libraryId}`} style={{ textDecoration: "underline" }}>{t`the Library`}</Link>)}`}
          </span>
        ) : (
          t`Tables published in the Library`
        ),
      });
      resetSelection();
    }
  };

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

        <Menu position="bottom-start">
          <Menu.Target>
            <Tooltip
              label={
                hasSelectedItems
                  ? t`Edit or publish selected tables`
                  : t`No tables selected`
              }
            >
              <Button
                p="sm"
                leftSection={<Icon name="ellipsis" />}
                disabled={!hasSelectedItems}
                style={{
                  width: 40,
                }}
              />
            </Tooltip>
          </Menu.Target>

          <Menu.Dropdown>
            <Menu.Item
              leftSection={<Icon name="pencil" />}
              onClick={() => setIsModalOpen(true)}
            >
              {t`Edit`}
            </Menu.Item>

            <Menu.Item
              leftSection={<Icon name="model" />}
              rightSection={
                <Tooltip
                  label={t`Create a model for each table and place them in a given collection.`}
                >
                  <Icon name="info_outline" />
                </Tooltip>
              }
              onClick={() => setIsCreateModelsModalOpen(true)}
            >
              {t`Create models`}
            </Menu.Item>

            {/*             <Menu.Item
              leftSection={<Icon name="model_with_badge" />}
              rightSection={
                <Tooltip
                  label={t`Create a model for each table and publish them in the Library.`}
                >
                  <Icon name="info_outline" />
                </Tooltip>
              }
              onClick={handlePublishModels}
            >
              {t`Publish models`}
            </Menu.Item> */}
          </Menu.Dropdown>
        </Menu>
      </Group>

      <Box style={{ overflow: "auto" }}>
        {deferredQuery === "" && filtersCount === 0 ? (
          <Tree
            path={path}
            onChange={onChange}
            selectedTables={selectedTables}
            setSelectedTables={setSelectedTables}
            selectedSchemas={selectedSchemas}
            setSelectedSchemas={setSelectedSchemas}
            selectedDatabases={selectedDatabases}
            setSelectedDatabases={setSelectedDatabases}
            setOnUpdateCallback={setOnUpdateCallback}
          />
        ) : (
          <SearchNew
            query={deferredQuery}
            params={params}
            filters={filters}
            selectedTables={selectedTables}
            setSelectedTables={setSelectedTables}
            setOnUpdateCallback={setOnUpdateCallback}
          />
        )}
      </Box>

      <EditTableMetadataModal
        tables={selectedTables}
        schemas={selectedSchemas}
        databases={selectedDatabases}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onUpdate={handleModalUpdate}
      />

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
