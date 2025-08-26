import { useState } from "react";
import { t } from "ttag";

import {
  Badge,
  Box,
  Center,
  Code,
  Flex,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import { useGetGitDiffQuery, useListGitBranchesQuery } from "metabase-enterprise/api/git-sync";
import type { GitDiff } from "metabase-types/api";

interface ViewChangesModalProps {
  opened: boolean;
  onClose: () => void;
  currentBranch: string;
}

export const ViewChangesModal = ({
  opened,
  onClose,
  currentBranch,
}: ViewChangesModalProps) => {
  const [selectedItem, setSelectedItem] = useState<number | null>(null);

  const { data: branches = [] } = useListGitBranchesQuery();
  const currentBranchObj = branches.find((b) => b.name === currentBranch);
  
  const { data: diffs = [], isLoading, error } = useGetGitDiffQuery(
    { branchId: currentBranchObj?.id || 0 },
    { skip: !opened || !currentBranchObj },
  );


  const selectedDiff = diffs.find((d) => d.id === selectedItem) || diffs[0];

  const getStatusText = (status: GitDiff["status"]) => {
    switch (status) {
      case "added":
        return "A";
      case "modified":
        return "M";
      case "deleted":
        return "D";
      default:
        return "?";
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t`Changes in ${currentBranch}`}
      size="calc(100vw - 3rem)"
      styles={{
        content: {
          height: "calc(100vh - 3rem)",
          maxHeight: "calc(100vh - 3rem)",
          display: "flex",
          flexDirection: "column",
        },
        body: {
          flex: 1,
          padding: 0,
          overflow: "hidden",
        },
      }}
    >
      {isLoading ? (
        <Center h="100%">
          <Stack align="center">
            <Loader size="lg" />
            <Text c="dimmed">{t`Loading changes...`}</Text>
          </Stack>
        </Center>
      ) : diffs.length === 0 ? (
        <Center h="100%">
          <Stack align="center">
            <Text c="dimmed">{t`No changes found`}</Text>
            <Text size="sm" c="dimmed">
              {t`This branch has no changes`}
            </Text>
          </Stack>
        </Center>
      ) : (
        <Flex h="100%" style={{ overflow: "hidden" }}>
          <Box
            w={300}
            p="md"
            style={{
              borderRight: "1px solid var(--mb-color-border)",
              backgroundColor: "var(--mb-color-bg-light)",
            }}
          >
            <Group mb="md" justify="space-between">
              <Text fw={600}>{t`Content changed`}</Text>
              <Text size="xs" c="text-medium">
                {diffs.length} {diffs.length === 1 ? "item" : "items"}
              </Text>
            </Group>

            <Stack gap={0}>
              {diffs.map((diff) => (
                <UnstyledButton
                  key={diff.id}
                  onClick={() => setSelectedItem(diff.id)}
                  p="sm"
                  style={{
                    backgroundColor:
                      selectedItem === diff.id ||
                      (!selectedItem && diff === selectedDiff)
                        ? "var(--mb-color-bg-medium)"
                        : "transparent",
                    borderRadius: 0,
                  }}
                  styles={{
                    root: {
                      "&:hover": {
                        backgroundColor: "var(--mb-color-bg-medium)",
                      },
                    },
                  }}
                >
                  <Group gap="xs" justify="space-between" w="100%">
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Text size="md" truncate>
                        {diff.name}
                      </Text>
                      <Text size="xs" c="text-medium" truncate>
                        {diff.content_type === "card" ? t`Question` : t`${diff.content_type}`}
                      </Text>
                    </Box>
                    <Badge
                      size="xs"
                      bg={
                        diff.status === "added"
                          ? "success"
                          : diff.status === "deleted"
                            ? "danger"
                            : "brand"
                      }
                      c="white"
                    >
                      {getStatusText(diff.status)}
                    </Badge>
                  </Group>
                </UnstyledButton>
              ))}
            </Stack>
          </Box>

          <Box style={{ flex: 1, overflow: "hidden" }}>
            {selectedDiff ? (
              <Stack h="100%" gap={0}>
                <Box
                  p="md"
                  style={{
                    borderBottom: "1px solid var(--mb-color-border)",
                    backgroundColor: "var(--mb-color-bg-light)",
                  }}
                >
                  <Group justify="space-between">
                    <Group gap="xs">
                      <Text fw={600} size="sm">
                        {selectedDiff.name}
                      </Text>
                      <Badge
                        size="xs"
                        bg={
                          selectedDiff.status === "added"
                            ? "success"
                            : selectedDiff.status === "deleted"
                              ? "danger"
                              : "brand"
                        }
                        c="white"
                      >
                        {selectedDiff.status}
                      </Badge>
                    </Group>
                    <Text size="xs" c="text-medium">
                      {selectedDiff.content_type === "card" ? t`Question` : t`${selectedDiff.content_type}`}
                    </Text>
                  </Group>
                </Box>

                <ScrollArea flex={1}>
                  {selectedDiff.status === "added" && selectedDiff.current && (
                    <Stack gap="md" p="md">
                      <Text fw={600} c="success" size="sm">{t`Added Content`}</Text>
                      <Code
                        block
                        style={{
                          backgroundColor: "var(--mb-color-bg-white)",
                          border: "1px solid var(--mb-color-border)",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          fontSize: "12px",
                          lineHeight: "1.5",
                        }}
                      >
                        {JSON.stringify(selectedDiff.current, null, 2)}
                      </Code>
                    </Stack>
                  )}

                  {selectedDiff.status === "deleted" && selectedDiff.original && (
                    <Stack gap="md" p="md">
                      <Text fw={600} c="red" size="sm">{t`Deleted Content`}</Text>
                      <Code
                        block
                        style={{
                          backgroundColor: "var(--mb-color-bg-white)",
                          border: "1px solid var(--mb-color-border)",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          fontSize: "12px",
                          lineHeight: "1.5",
                        }}
                      >
                        {JSON.stringify(selectedDiff.original, null, 2)}
                      </Code>
                    </Stack>
                  )}

                  {selectedDiff.status === "modified" && (
                    <Stack gap={0}>
                      {selectedDiff.original && (
                        <Box p="md" style={{ borderBottom: "1px solid var(--mb-color-border)" }}>
                          <Text fw={600} c="text-medium" size="sm" mb="md">{t`Original`}</Text>
                          <Code
                            block
                            style={{
                              backgroundColor: "var(--mb-color-bg-white)",
                              border: "1px solid var(--mb-color-border)",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                              fontSize: "12px",
                              lineHeight: "1.5",
                            }}
                          >
                            {JSON.stringify(selectedDiff.original, null, 2)}
                          </Code>
                        </Box>
                      )}
                      
                      {selectedDiff.current && (
                        <Box p="md">
                          <Text fw={600} c="brand" size="sm" mb="md">{t`Modified`}</Text>
                          <Code
                            block
                            style={{
                              backgroundColor: "var(--mb-color-bg-white)",
                              border: "1px solid var(--mb-color-border)",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                              fontSize: "12px",
                              lineHeight: "1.5",
                            }}
                          >
                            {JSON.stringify(selectedDiff.current, null, 2)}
                          </Code>
                        </Box>
                      )}
                    </Stack>
                  )}
                </ScrollArea>
              </Stack>
            ) : (
              <Center h="100%">
                <Text c="dimmed">{t`Select an item to view changes`}</Text>
              </Center>
            )}
          </Box>
        </Flex>
      )}
    </Modal>
  );
};
