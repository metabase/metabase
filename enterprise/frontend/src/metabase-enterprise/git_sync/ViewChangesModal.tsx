import { useState } from "react";
import { t } from "ttag";

import {
  Badge,
  Box,
  Center,
  Flex,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import {
  useGetGitDiffQuery,
  useListGitBranchesQuery,
} from "metabase-enterprise/api/git-sync";
import type { GitDiffContentType, GitDiffStatus } from "metabase-types/api";

import { DiffRenderer } from "./components/DiffRenderer";
import {
  CardRenderer,
  DefaultRenderer,
  TransformRenderer,
} from "./components/EntityDiffRenderers";

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

  const { data: diffs = [], isLoading } = useGetGitDiffQuery(
    { branchId: currentBranchObj?.id || 0 },
    { skip: !opened || !currentBranchObj },
  );

  const selectedDiff = diffs.find((d) => d.id === selectedItem) || diffs[0];

  const getStatusText = (status: GitDiffStatus) => {
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

  const getContentTypeLabel = (contentType: GitDiffContentType) => {
    switch (contentType) {
      case "card":
        return t`Question`;
      case "transform":
        return t`Transform`;

      default:
        return contentType;
    }
  };

  const getEntityRenderer = (contentType: GitDiffContentType) => {
    switch (contentType) {
      case "card":
        return CardRenderer;
      case "transform":
        return TransformRenderer;
      default:
        return DefaultRenderer;
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
            bg="var(--mb-color-bg-light)"
            style={{
              borderRight: "1px solid var(--mb-color-border)",
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
                  bg={
                    selectedItem === diff.id ||
                    (!selectedItem && diff === selectedDiff)
                      ? "var(--mb-color-bg-medium)"
                      : "transparent"
                  }
                  style={{
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
                    <Box flex={1} miw={0}>
                      <Text size="md" truncate>
                        {diff.name}
                      </Text>
                      <Text size="xs" c="text-medium" truncate>
                        {getContentTypeLabel(diff.content_type)}
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

          <Box flex={1} style={{ overflow: "hidden" }}>
            {selectedDiff ? (
              <Stack h="100%" gap={0}>
                <Box
                  p="md"
                  bg="var(--mb-color-bg-light)"
                  style={{
                    borderBottom: "1px solid var(--mb-color-border)",
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
                      {getContentTypeLabel(selectedDiff.content_type)}
                    </Text>
                  </Group>
                </Box>

                <ScrollArea flex={1}>
                  <DiffRenderer
                    diff={selectedDiff}
                    renderContent={(entity) => {
                      const Renderer = getEntityRenderer(
                        selectedDiff.content_type,
                      );
                      return <Renderer entity={entity} />;
                    }}
                  />
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
