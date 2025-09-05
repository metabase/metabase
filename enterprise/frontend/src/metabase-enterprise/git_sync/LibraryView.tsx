import { useMemo, useState } from "react";
import { t } from "ttag";

import { Tree } from "metabase/common/components/tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { useSetting } from "metabase/common/hooks";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import {
  Box,
  Button,
  Flex,
  Icon,
  Loader,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title,
} from "metabase/ui";
import {
  type GitTreeNode,
  useGetFileContentQuery,
  useGetRepositoryTreeQuery,
  useImportGitMutation,
} from "metabase-enterprise/api";

import { FileContentViewer } from "./FileContentViewer";

function convertGitTreeToTreeItems(node: GitTreeNode): ITreeNodeItem {
  return {
    id: node.id,
    name: node.id,
    icon: node.type === "folder" ? "folder" : "document",
    children: node.children?.map(convertGitTreeToTreeItems),
  };
}

function filterTreeItems(
  items: ITreeNodeItem[],
  filter: string,
): ITreeNodeItem[] {
  if (!filter) {
    return items;
  }

  const lowerFilter = filter.toLowerCase();
  const result: ITreeNodeItem[] = [];

  for (const item of items) {
    const nameMatches = item.name.toLowerCase().includes(lowerFilter);
    const filteredChildren = item.children
      ? filterTreeItems(item.children, filter)
      : undefined;

    if (nameMatches || (filteredChildren && filteredChildren.length > 0)) {
      result.push({
        ...item,
        children: filteredChildren,
      });
    }
  }

  return result;
}

export const LibraryView = () => {
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [filterValue, setFilterValue] = useState("");
  const debouncedFilter = useDebouncedValue(filterValue, 300);
  const importBranch = useSetting("git-sync-import-branch");
  const [importGit, { isLoading: isImporting }] = useImportGitMutation();
  const dispatch = useDispatch();

  const { data: treeData, isFetching: isTreeFetching } =
    useGetRepositoryTreeQuery();
  const {
    data: fileContent,
    isLoading: isFileLoading,
    isFetching: isFileFetching,
  } = useGetFileContentQuery(selectedFilePath ?? "", {
    skip: !selectedFilePath,
  });

  const handleNodeSelect = (item: ITreeNodeItem) => {
    if (!item.children) {
      setSelectedFilePath(item.id as string);
    }
  };

  const handleImport = async () => {
    try {
      await importGit({}).unwrap();
      dispatch(
        addUndo({
          message: importBranch
            ? t`Successfully imported from ${importBranch}`
            : t`Successfully imported from git`,
        }),
      );
    } catch (error) {
      dispatch(
        addUndo({
          message: t`Failed to import from git`,
          error: true,
        }),
      );
    }
  };

  const treeItems = useMemo(() => {
    if (!treeData) {
      return [];
    }
    const items = [convertGitTreeToTreeItems(treeData)];
    return filterTreeItems(items, debouncedFilter);
  }, [treeData, debouncedFilter]);

  return (
    <Flex h="100%" gap={0}>
      <Box
        w="360px"
        h="100%"
        style={{
          borderRight: "1px solid var(--mb-color-border)",
        }}
      >
        <Flex direction="column" h="100%">
          <Box px="lg" pt="lg">
            <Title order={4}>{t`Your library`}</Title>
          </Box>
          <Box p="md">
            <TextInput
              placeholder={t`Go to file`}
              value={filterValue}
              onChange={(e) => setFilterValue(e.currentTarget.value)}
              leftSection={<Icon name="search" />}
              size="sm"
            />
          </Box>
          <ScrollArea flex={1}>
            {isTreeFetching ? (
              <Flex justify="center" align="center" h="200px">
                <Loader size="sm" />
              </Flex>
            ) : (
              <Tree
                initiallyExpanded
                data={treeItems}
                selectedId={selectedFilePath ?? undefined}
                onSelect={handleNodeSelect}
                emptyState={
                  <Flex justify="center" align="center" h="200px">
                    <Stack align="center" gap="md">
                      <Icon
                        name="search"
                        size={32}
                        color="var(--mb-color-text-light)"
                      />
                      <Text c="text-light">{t`No results found`}</Text>
                    </Stack>
                  </Flex>
                }
              />
            )}
          </ScrollArea>
          <Box
            p="md"
            style={{
              borderTop: "1px solid var(--mb-color-border)",
            }}
          >
            <Button
              variant="filled"
              fullWidth
              leftSection={<Icon name="download" />}
              onClick={handleImport}
              loading={isImporting}
            >
              {importBranch ? t`Import from ${importBranch}` : t`Import`}
            </Button>
          </Box>
        </Flex>
      </Box>

      <Box flex={1} h="100%">
        {selectedFilePath ? (
          isFileFetching || (isFileLoading && !fileContent) ? (
            <Flex justify="center" align="center" h="100%">
              <Loader />
            </Flex>
          ) : fileContent && fileContent.path === selectedFilePath ? (
            <FileContentViewer content={fileContent} />
          ) : (
            <Flex justify="center" align="center" h="100%">
              <Text c="text-light">{t`File not found`}</Text>
            </Flex>
          )
        ) : (
          <Flex justify="center" align="center" h="100%">
            <Stack align="center" gap="md">
              <Icon
                name="document"
                size={48}
                color="var(--mb-color-text-light)"
              />
              <Text c="text-light">{t`Select a file to view its contents`}</Text>
            </Stack>
          </Flex>
        )}
      </Box>
    </Flex>
  );
};
