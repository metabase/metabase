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
import { useGetGitDiffQuery } from "metabase-enterprise/api/git-sync";
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
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const { data: diffs = [], isLoading } = useGetGitDiffQuery(
    { branch: currentBranch, base: "main" },
    { skip: !opened },
  );

  const selectedDiff = diffs.find((d) => d.path === selectedFile) || diffs[0];

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
              {t`This branch is up to date with main`}
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
                  key={diff.path}
                  onClick={() => setSelectedFile(diff.path)}
                  p="sm"
                  style={{
                    backgroundColor:
                      selectedFile === diff.path ||
                      (!selectedFile && diff === selectedDiff)
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
                        {diff.path}
                      </Text>
                      <Text size="xs" c="text-medium" truncate>
                        {t`Transform`}
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
                        {selectedDiff.path}
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
                      {t`Transform`}
                    </Text>
                  </Group>
                </Box>

                <ScrollArea flex={1} p="md">
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
                    {selectedDiff.content
                      ? JSON.stringify(selectedDiff.content, null, 2)
                      : "Content unavailable"}
                  </Code>
                </ScrollArea>
              </Stack>
            ) : (
              <Center h="100%">
                <Text c="dimmed">{t`Select a file to view changes`}</Text>
              </Center>
            )}
          </Box>
        </Flex>
      )}
    </Modal>
  );
};
