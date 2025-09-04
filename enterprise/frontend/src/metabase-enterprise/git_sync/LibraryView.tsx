import { useState } from "react";
import { t } from "ttag";

import { Tree } from "metabase/common/components/tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import {
  Box,
  Flex,
  Icon,
  Loader,
  ScrollArea,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import {
  type GitTreeNode,
  useGetFileContentQuery,
  useGetRepositoryTreeQuery,
} from "metabase-enterprise/api";

import { FileContentViewer } from "./FileContentViewer";

function convertGitTreeToTreeItems(node: GitTreeNode): ITreeNodeItem {
  return {
    id: node.path,
    name: node.name,
    icon: node.type === "folder" ? "folder" : "document",
    children: node.children?.map(convertGitTreeToTreeItems),
  };
}

export const LibraryView = () => {
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const { data: treeData, isLoading: isTreeLoading } =
    useGetRepositoryTreeQuery();
  const { data: fileContent, isLoading: isFileLoading } =
    useGetFileContentQuery(selectedFilePath ?? "", {
      skip: !selectedFilePath,
    });

  const handleNodeSelect = (item: ITreeNodeItem) => {
    if (!item.children) {
      setSelectedFilePath(item.id as string);
    }
  };

  const treeItems = treeData ? [convertGitTreeToTreeItems(treeData)] : [];

  return (
    <Flex h="100%" gap={0}>
      <Box
        w="300px"
        h="100%"
        style={{
          borderRight: "1px solid var(--mb-color-border)",
        }}
      >
        <Flex direction="column" h="100%">
          <Box p="lg">
            <Title order={4}>{t`Your library`}</Title>
          </Box>
          <ScrollArea flex={1} p="md">
            {isTreeLoading ? (
              <Flex justify="center" align="center" h="200px">
                <Loader size="sm" />
              </Flex>
            ) : (
              <Tree
                data={treeItems}
                selectedId={selectedFilePath ?? undefined}
                onSelect={handleNodeSelect}
              />
            )}
          </ScrollArea>
        </Flex>
      </Box>

      <Box flex={1} h="100%">
        {selectedFilePath ? (
          isFileLoading ? (
            <Flex justify="center" align="center" h="100%">
              <Loader />
            </Flex>
          ) : fileContent ? (
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
