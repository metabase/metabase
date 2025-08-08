import { useCallback, useEffect, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { Alert, Button, Card, Group, Loader, Stack, Text } from "metabase/ui";
import {
  type Workspace,
  useDeleteWorkspaceMutation,
  useListWorkspacesQuery,
} from "metabase-enterprise/api";
import type { CollectionId } from "metabase-types/api";

import { CreateWorkspaceModal } from "./CreateWorkspaceModal";

interface WorkspaceListProps {
  collectionId: CollectionId;
}

export function WorkspaceList({ collectionId }: WorkspaceListProps) {
  const dispatch = useDispatch();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { data: workspaces = [], isLoading, error } = useListWorkspacesQuery();
  const [deleteWorkspace] = useDeleteWorkspaceMutation();

  const filteredWorkspaces = workspaces.filter(
    (w) => w.collection_id === collectionId,
  );

  const handleWorkspaceClick = useCallback(
    (workspace: Workspace) => {
      dispatch(push(`/workspace/${workspace.id}`));
    },
    [dispatch],
  );

  const handleDeleteWorkspace = useCallback(
    async (workspace: Workspace) => {
      if (
        window.confirm(
          t`Are you sure you want to delete workspace "${workspace.name}"?`,
        )
      ) {
        try {
          await deleteWorkspace(workspace.id).unwrap();
        } catch (error) {
          console.error("Failed to delete workspace:", error);
        }
      }
    },
    [deleteWorkspace],
  );

  if (isLoading) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }

  if (error) {
    return (
      <Alert color="red" mb="md">
        {t`Failed to load workspaces`}
      </Alert>
    );
  }

  return (
    <>
      <Stack gap="md">
        <Group justify="apart">
          <Text size="lg" fw={600}>
            {t`Workspaces`}
          </Text>
          <Button
            variant="filled"
            onClick={() => setShowCreateModal(true)}
            data-testid="create-workspace-button"
          >
            {t`Create Workspace`}
          </Button>
        </Group>

        {filteredWorkspaces.length === 0 ? (
          <Card p="xl" withBorder>
            <Stack align="center" gap="md">
              <Text color="dimmed">{t`No workspaces in this collection`}</Text>
              <Button
                variant="light"
                onClick={() => setShowCreateModal(true)}
              >
                {t`Create your first workspace`}
              </Button>
            </Stack>
          </Card>
        ) : (
          <Stack gap="sm">
            {filteredWorkspaces.map((workspace) => (
              <Card
                key={workspace.id}
                p="md"
                withBorder
                style={{ cursor: "pointer" }}
                onClick={() => handleWorkspaceClick(workspace)}
              >
                <Group justify="apart">
                  <Stack gap="xs">
                    <Text fw={500}>{workspace.name}</Text>
                    {workspace.description && (
                      <Text size="sm" color="dimmed">
                        {workspace.description}
                      </Text>
                    )}
                  </Stack>
                  <Group gap="xs">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteWorkspace(workspace);
                      }}
                      color="red"
                      style={{ 
                        flexShrink: 0,
                        backgroundColor: '#fee2e2',
                        border: '1px solid #dc2626',
                        color: '#dc2626'
                      }}
                    >
                      Delete
                    </Button>
                  </Group>
                </Group>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>

      <CreateWorkspaceModal
        collectionId={collectionId}
        opened={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => setShowCreateModal(false)}
      />
    </>
  );
}