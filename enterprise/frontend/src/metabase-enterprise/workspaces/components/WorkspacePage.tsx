import { useCallback, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import {
  Alert,
  Button,
  Card,
  Group,
  Icon,
  Loader,
  Stack,
  Tabs,
  Text,
  TextInput,
 Textarea } from "metabase/ui";
import {
  useDeleteWorkspaceMutation,
  useGetWorkspaceQuery,
  useUpdateWorkspaceMutation,
} from "metabase-enterprise/api";

import { CreateTransformModal } from "./CreateTransformModal";
import { LinkTransformModal } from "./LinkTransformModal";
import { PlansTab } from "./PlansTab";

interface WorkspacePageProps {
  workspaceId: number;
}

export function WorkspacePage({ workspaceId }: WorkspacePageProps) {
  const dispatch = useDispatch();
  const {
    data: workspace,
    isLoading,
    error,
    refetch,
  } = useGetWorkspaceQuery(workspaceId);
  const [updateWorkspace, { isLoading: isUpdating }] =
    useUpdateWorkspaceMutation();
  const [deleteWorkspace] = useDeleteWorkspaceMutation();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [showCreateTransformModal, setShowCreateTransformModal] = useState(false);
  const [showLinkTransformModal, setShowLinkTransformModal] = useState(false);

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

  const handleTransformSuccess = useCallback(() => {
    setShowCreateTransformModal(false);
    refetch();
  }, [refetch]);

  const handleLinkTransformSuccess = useCallback(() => {
    setShowLinkTransformModal(false);
    refetch();
  }, [refetch]);

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
              <Button variant="light" onClick={handleDelete}>
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
          <Stack gap="lg">
            {/* Workspace Information */}
            <Card p="xl" withBorder>
              <Stack gap="md">
                <Text fw={500} size="lg">{t`Workspace Information`}</Text>
                <Group>
                  <Text c="dimmed">{t`Created:`}</Text>
                  <Text>
                    {workspace.created_at
                      ? new Date(workspace.created_at).toLocaleDateString()
                      : t`Unknown`}
                  </Text>
                </Group>
                <Group>
                  <Text c="dimmed">{t`Last Updated:`}</Text>
                  <Text>
                    {workspace.updated_at
                      ? new Date(workspace.updated_at).toLocaleDateString()
                      : t`Unknown`}
                  </Text>
                </Group>
              </Stack>
            </Card>

            {/* Summary Stats */}
            <Card p="xl" withBorder>
              <Stack gap="md">
                <Text fw={500} size="lg">{t`Summary`}</Text>
                <Group>
                  <Stack gap="xs" style={{ flex: 1 }}>
                    <Group gap="xs">
                      <Text fw={700} size="xl" style={{ color: '#3b82f6' }}>
                        {workspace.plans?.length || 0}
                      </Text>
                      <Text>{t`Plans`}</Text>
                    </Group>
                    {workspace.plans && workspace.plans.length > 0 && (
                      <Text size="sm" style={{ color: '#6b7280' }}>
                        Latest: {workspace.plans[workspace.plans.length - 1]?.title || 'Untitled'}
                      </Text>
                    )}
                  </Stack>

                  <Stack gap="xs" style={{ flex: 1 }}>
                    <Group gap="xs">
                      <Text fw={700} size="xl" style={{ color: '#10b981' }}>
                        {workspace.transforms?.length || 0}
                      </Text>
                      <Text>{t`Transforms`}</Text>
                    </Group>
                    {workspace.transforms && workspace.transforms.length > 0 && (
                      <Text size="sm" style={{ color: '#6b7280' }}>
                        Latest: {workspace.transforms[workspace.transforms.length - 1]?.name || 'Untitled'}
                      </Text>
                    )}
                  </Stack>

                  <Stack gap="xs" style={{ flex: 1 }}>
                    <Group gap="xs">
                      <Text fw={700} size="xl" style={{ color: '#8b5cf6' }}>
                        {workspace.users?.length || 0}
                      </Text>
                      <Text>{t`Users`}</Text>
                    </Group>
                    {workspace.users && workspace.users.length > 0 && (
                      <Text size="sm" style={{ color: '#6b7280' }}>
                        Latest: {workspace.users[workspace.users.length - 1]?.name || 'Unknown'}
                      </Text>
                    )}
                  </Stack>

                  <Stack gap="xs" style={{ flex: 1 }}>
                    <Group gap="xs">
                      <Text fw={700} size="xl" style={{ color: '#f97316' }}>
                        {workspace.data_warehouses?.length || 0}
                      </Text>
                      <Text>{t`Data Warehouses`}</Text>
                    </Group>
                    {workspace.data_warehouses && workspace.data_warehouses.length > 0 && (
                      <Text size="sm" style={{ color: '#6b7280' }}>
                        Latest: {workspace.data_warehouses[workspace.data_warehouses.length - 1]?.name || 'Untitled'}
                      </Text>
                    )}
                  </Stack>

                  <Stack gap="xs" style={{ flex: 1 }}>
                    <Group gap="xs">
                      <Text fw={700} size="xl" style={{ color: '#ef4444' }}>
                        {workspace.documents?.length || 0}
                      </Text>
                      <Text>{t`Documents`}</Text>
                    </Group>
                  </Stack>
                </Group>
              </Stack>
            </Card>

            {/* Recent Activity */}
            <Card p="xl" withBorder>
              <Stack gap="md">
                <Text fw={500} size="lg">{t`Recent Activity`}</Text>
                <Stack gap="sm">
                  {workspace.plans && workspace.plans.length > 0 && (
                    <Group justify="apart" p="sm" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: 8 }}>
                      <Stack gap={2}>
                        <Text size="sm" fw={500}>
                          {workspace.plans[workspace.plans.length - 1]?.title}
                        </Text>
                        <Text size="xs" c="dimmed">Plan</Text>
                      </Stack>
                      <Text size="xs" c="dimmed">
                        {new Date(workspace.plans[workspace.plans.length - 1]?.created_at || '').toLocaleDateString()}
                      </Text>
                    </Group>
                  )}
                  
                  {workspace.transforms && workspace.transforms.length > 0 && (
                    <Group justify="apart" p="sm" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', borderRadius: 8 }}>
                      <Stack gap={2}>
                        <Text size="sm" fw={500}>
                          {workspace.transforms[workspace.transforms.length - 1]?.name}
                        </Text>
                        <Text size="xs" c="dimmed">Transform</Text>
                      </Stack>
                      <Text size="xs" c="dimmed">
                        {new Date(workspace.transforms[workspace.transforms.length - 1]?.created_at || '').toLocaleDateString()}
                      </Text>
                    </Group>
                  )}

                  {workspace.users && workspace.users.length > 0 && (
                    <Group justify="apart" p="sm" style={{ backgroundColor: 'rgba(147, 51, 234, 0.1)', borderRadius: 8 }}>
                      <Stack gap={2}>
                        <Text size="sm" fw={500}>
                          {workspace.users[workspace.users.length - 1]?.name}
                        </Text>
                        <Text size="xs" c="dimmed">User added</Text>
                      </Stack>
                      <Text size="xs" c="dimmed">
                        {new Date(workspace.users[workspace.users.length - 1]?.created_at || '').toLocaleDateString()}
                      </Text>
                    </Group>
                  )}

                  {workspace.data_warehouses && workspace.data_warehouses.length > 0 && (
                    <Group justify="apart" p="sm" style={{ backgroundColor: 'rgba(249, 115, 22, 0.1)', borderRadius: 8 }}>
                      <Stack gap={2}>
                        <Text size="sm" fw={500}>
                          {workspace.data_warehouses[workspace.data_warehouses.length - 1]?.name}
                        </Text>
                        <Text size="xs" c="dimmed">Data Warehouse</Text>
                      </Stack>
                      <Text size="xs" c="dimmed">
                        {new Date(workspace.data_warehouses[workspace.data_warehouses.length - 1]?.created_at || '').toLocaleDateString()}
                      </Text>
                    </Group>
                  )}

                  {(!workspace.plans?.length && !workspace.transforms?.length && !workspace.users?.length && !workspace.data_warehouses?.length) && (
                    <Text c="dimmed" size="sm" ta="center" py="xl">
                      {t`No activity yet. Start by adding some plans or transforms!`}
                    </Text>
                  )}
                </Stack>
              </Stack>
            </Card>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="plans" pt="xl">
          <PlansTab
            workspaceId={workspaceId}
            plans={workspace.plans}
            onRefresh={refetch}
          />
        </Tabs.Panel>

        <Tabs.Panel value="transforms" pt="xl">
          <Card p="xl" withBorder>
            <Stack gap="md">
              <Group justify="apart">
                <Text fw={500}>{t`Transforms`}</Text>
                <Group gap="xs">
                  <Button 
                    variant="light" 
                    size="xs"
                    onClick={() => setShowCreateTransformModal(true)}
                  >
                    {t`Create Transform`}
                  </Button>
                  <Button 
                    variant="outline" 
                    size="xs"
                    onClick={() => setShowLinkTransformModal(true)}
                  >
                    {t`Link Existing`}
                  </Button>
                </Group>
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
      
      <CreateTransformModal
        workspaceId={workspaceId}
        opened={showCreateTransformModal}
        onClose={() => setShowCreateTransformModal(false)}
        onSuccess={handleTransformSuccess}
      />
      
      <LinkTransformModal
        workspaceId={workspaceId}
        opened={showLinkTransformModal}
        onClose={() => setShowLinkTransformModal(false)}
        onSuccess={handleLinkTransformSuccess}
      />
    </Stack>
  );
}
