import { useCallback, useState } from "react";
import { t } from "ttag";

import { Button, Card, Modal, Stack, Text, TextInput } from "metabase/ui";
import {
  useLinkTransformToWorkspaceMutation,
  useListTransformsQuery,
} from "metabase-enterprise/api";

interface LinkTransformModalProps {
  workspaceId: number;
  opened: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function LinkTransformModal({
  workspaceId,
  opened,
  onClose,
  onSuccess,
}: LinkTransformModalProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const { data: transforms = [], isLoading: isLoadingTransforms } =
    useListTransformsQuery();
  const [linkTransform, { isLoading: isLinking }] =
    useLinkTransformToWorkspaceMutation();

  const filteredTransforms = transforms.filter((transform) =>
    transform.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleLinkTransform = useCallback(
    async (transformId: number) => {
      try {
        await linkTransform({ workspaceId, transformId }).unwrap();
        onSuccess?.();
        onClose();
      } catch (error) {
        console.error("Failed to link transform:", error);

        // Provide more detailed error information
        let errorMessage = t`Failed to link transform. Please try again.`;
        if (error && typeof error === "object") {
          if ("data" in error && error.data) {
            const errorData = error.data as any;
            if (typeof errorData === "string") {
              errorMessage = errorData;
            } else if (errorData.message) {
              errorMessage = errorData.message;
            }
          } else if ("status" in error) {
            errorMessage = t`Failed to link transform (HTTP ${error.status}). Please try again.`;
          }
        }

        alert(errorMessage);
      }
    },
    [workspaceId, linkTransform, onSuccess, onClose],
  );

  return (
    <Modal
      title={t`Link Existing Transform`}
      opened={opened}
      onClose={onClose}
      size="lg"
    >
      <Stack gap="md">
        <TextInput
          placeholder={t`Search transforms...`}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        {isLoadingTransforms ? (
          <Text c="dimmed" ta="center" py="xl">
            {t`Loading transforms...`}
          </Text>
        ) : filteredTransforms.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            {searchTerm
              ? t`No transforms found matching "${searchTerm}"`
              : t`No transforms available`}
          </Text>
        ) : (
          <Stack gap="sm" mah={400} style={{ overflowY: "auto" }}>
            {filteredTransforms.map((transform) => (
              <Card key={transform.id} p="md" withBorder>
                <Stack gap="xs">
                  <Text fw={500}>{transform.name}</Text>
                  {transform.description && (
                    <Text size="sm" c="dimmed">
                      {transform.description}
                    </Text>
                  )}
                  <Button
                    variant="light"
                    size="xs"
                    onClick={() => handleLinkTransform(transform.id)}
                    disabled={isLinking}
                    loading={isLinking}
                    style={{ alignSelf: "flex-start" }}
                  >
                    {t`Link to Workspace`}
                  </Button>
                </Stack>
              </Card>
            ))}
          </Stack>
        )}

        <Button variant="outline" onClick={onClose} disabled={isLinking}>
          {t`Cancel`}
        </Button>
      </Stack>
    </Modal>
  );
}
