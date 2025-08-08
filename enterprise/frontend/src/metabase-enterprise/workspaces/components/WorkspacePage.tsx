import { useCallback, useState } from "react";
import { t } from "ttag";
import { push } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";
import {
  Group,
  Text,
  Button,
  Card,
  Stack,
  Loader,
  Alert,
  Tabs,
  TextInput,
  Textarea,
} from "metabase/ui";
import { Icon } from "metabase/ui";

import {
  useGetWorkspaceQuery,
  useUpdateWorkspaceMutation,
  useDeleteWorkspaceMutation,
} from "metabase-enterprise/api";

interface WorkspacePageProps {
  workspaceId: number;
}

export function WorkspacePage({ workspaceId }: WorkspacePageProps) {
  const dispatch = useDispatch();
  const {
    data: workspace,
    isLoading,
    error,
  } = useGetWorkspaceQuery(workspaceId);
  const [updateWorkspace, { isLoading: isUpdating }] =
    useUpdateWorkspaceMutation();
  const [deleteWorkspace] = useDeleteWorkspaceMutation();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const handleEdit = useCallback(() => {
    if (workspace) {
      setEditName(workspace.name);
      setEditDescription(workspace.description || "");
      setIsEditing(true);
    }
  }, [workspace]);

  const handleSave = useCallback(async () => {
    if (workspace) {
      try {
        await updateWorkspace({
          id: workspace.id,
          name: editName,
          description: editDescription,
        }).unwrap();
        setIsEditing(false);
      } catch (error) {
        console.error("Failed to update workspace:", error);
      }
    }
  }, [workspace, editName, editDescription, updateWorkspace]);

  const handleDelete = useCallback(async () => {
    if (
      workspace &&
      window.confirm(
        t`Are you sure you want to delete workspace "${workspace.name}"?`,
      )
    ) {
      try {
        await deleteWorkspace(workspace.id).unwrap();
        dispatch(push(`/collection/${workspace.collection_id}`));
      } catch (error) {
        console.error("Failed to delete workspace:", error);
      }
    }
  }, [workspace, deleteWorkspace, dispatch]);

  const handleBack = useCallback(() => {
    if (workspace) {
      dispatch(push(`/collection/${workspace.collection_id}`));
    }
  }, [workspace, dispatch]);

  if (isLoading) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }

  if (error || !workspace) {
    return (
      <Alert color="red" mb="md">
        {t`Failed to load workspace`}
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="apart">
        <Group gap="md">
          <Button
            variant="subtle"
            leftSection={<Icon name="chevronleft" />}
            onClick={handleBack}
          >
            {t`Back to Collection`}
          </Button>
          {isEditing ? (
            <Stack gap="xs">
              <TextInput
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t`Workspace name`}
              />
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder={t`Workspace description`}
                minRows={2}
              />
            </Stack>
          ) : (
            <Stack gap="xs">
              <Text size="xl" fw={600}>
                {workspace.name}
              </Text>
              {workspace.description && (
                <Text size="sm" color="dimmed">
                  {workspace.description}
                </Text>
              )}
            </Stack>
          )}
        </Group>
        <Group gap="xs">
          {isEditing ? (
            <>
              <Button
                variant="outline"
                onClick={() => setIsEditing(false)}
                disabled={isUpdating}
              >
                {t`Cancel`}
              </Button>
              <Button
                variant="filled"
                onClick={handleSave}
                loading={isUpdating}
                disabled={!editName.trim()}
              >
                {t`Save`}
              </Button>
            </>
          ) : (
            <>
              <Button variant="light" onClick={handleEdit}>
                {t`Edit`}
              </Button>
              <Button variant="light" color="red" onClick={handleDelete}>
                {t`Delete`}
              </Button>
            </>
          )}
        </Group>
      </Group>

      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Tab value="overview">{t`Overview`}</Tabs.Tab>
          <Tabs.Tab value="plans">{t`Plans`}</Tabs.Tab>
          <Tabs.Tab value="transforms">{t`Transforms`}</Tabs.Tab>
          <Tabs.Tab value="documents">{t`Documents`}</Tabs.Tab>
          <Tabs.Tab value="users">{t`Users`}</Tabs.Tab>
          <Tabs.Tab value="data-warehouses">{t`Data Warehouses`}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="overview" pt="xl">
          <Card p="xl" withBorder>
            <Stack gap="md">
              <Text fw={500}>{t`Workspace Information`}</Text>
              <Stack gap="xs">
                <Group>
                  <Text color="dimmed">{t`Created:`}</Text>
                  <Text>
                    {workspace.created_at
                      ? new Date(workspace.created_at).toLocaleDateString()
                      : t`Unknown`}
                  </Text>
                </Group>
                <Group>
                  <Text color="dimmed">{t`Last Updated:`}</Text>
                  <Text>
                    {workspace.updated_at
                      ? new Date(workspace.updated_at).toLocaleDateString()
                      : t`Unknown`}
                  </Text>
                </Group>
              </Stack>
            </Stack>
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="plans" pt="xl">
          <Card p="xl" withBorder>
            <Stack gap="md">
              <Group justify="apart">
                <Text fw={500}>{t`Plans`}</Text>
                <Button variant="light" size="xs">
                  {t`Add Plan`}
                </Button>
              </Group>
              {workspace.plans && workspace.plans.length > 0 ? (
                <Stack gap="sm">
                  {workspace.plans.map((plan, index) => (
                    <Card key={index} p="md" withBorder>
                      <Text fw={500}>{plan.title}</Text>
                      <Text size="sm" color="dimmed">
                        {plan.description}
                      </Text>
                    </Card>
                  ))}
                </Stack>
              ) : (
                <Text color="dimmed">{t`No plans yet`}</Text>
              )}
            </Stack>
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="transforms" pt="xl">
          <Card p="xl" withBorder>
            <Stack gap="md">
              <Group justify="apart">
                <Text fw={500}>{t`Transforms`}</Text>
                <Button variant="light" size="xs">
                  {t`Add Transform`}
                </Button>
              </Group>
              {workspace.transforms && workspace.transforms.length > 0 ? (
                <Stack gap="sm">
                  {workspace.transforms.map((transform, index) => (
                    <Card key={index} p="md" withBorder>
                      <Text fw={500}>{transform.name}</Text>
                      <Text size="sm" color="dimmed">
                        {transform.description}
                      </Text>
                    </Card>
                  ))}
                </Stack>
              ) : (
                <Text color="dimmed">{t`No transforms yet`}</Text>
              )}
            </Stack>
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="documents" pt="xl">
          <Card p="xl" withBorder>
            <Stack gap="md">
              <Group justify="apart">
                <Text fw={500}>{t`Documents`}</Text>
                <Button variant="light" size="xs">
                  {t`Link Document`}
                </Button>
              </Group>
              {workspace.documents && workspace.documents.length > 0 ? (
                <Stack gap="sm">
                  {workspace.documents.map((doc, index) => (
                    <Card key={index} p="md" withBorder>
                      <Text>{t`Document ID: ${doc}`}</Text>
                    </Card>
                  ))}
                </Stack>
              ) : (
                <Text color="dimmed">{t`No documents linked`}</Text>
              )}
            </Stack>
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="users" pt="xl">
          <Card p="xl" withBorder>
            <Stack gap="md">
              <Group justify="apart">
                <Text fw={500}>{t`Users`}</Text>
                <Button variant="light" size="xs">
                  {t`Add User`}
                </Button>
              </Group>
              {workspace.users && workspace.users.length > 0 ? (
                <Stack gap="sm">
                  {workspace.users.map((user, index) => (
                    <Card key={index} p="md" withBorder>
                      <Text fw={500}>{user.name}</Text>
                      <Text size="sm" color="dimmed">
                        {user.email}
                      </Text>
                    </Card>
                  ))}
                </Stack>
              ) : (
                <Text color="dimmed">{t`No users added`}</Text>
              )}
            </Stack>
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="data-warehouses" pt="xl">
          <Card p="xl" withBorder>
            <Stack gap="md">
              <Group justify="apart">
                <Text fw={500}>{t`Data Warehouses`}</Text>
                <Button variant="light" size="xs">
                  {t`Add Data Warehouse`}
                </Button>
              </Group>
              {workspace.data_warehouses &&
              workspace.data_warehouses.length > 0 ? (
                <Stack gap="sm">
                  {workspace.data_warehouses.map((dw, index) => (
                    <Card key={index} p="md" withBorder>
                      <Text fw={500}>{dw.name}</Text>
                      <Text size="sm" color="dimmed">
                        {t`Type: ${dw.type}`}
                      </Text>
                    </Card>
                  ))}
                </Stack>
              ) : (
                <Text color="dimmed">{t`No data warehouses connected`}</Text>
              )}
            </Stack>
          </Card>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}