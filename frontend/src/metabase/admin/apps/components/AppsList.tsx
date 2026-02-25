import { useCallback } from "react";
import { t } from "ttag";

import {
  useDeleteAppMutation,
  useGetCollectionQuery,
  useListAppsQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import AdminS from "metabase/css/admin.module.css";
import { useRouter } from "metabase/router";
import { Badge, Button, Group, Stack, Text, Title } from "metabase/ui";
import type { App } from "metabase-types/api/admin";

export function AppsList() {
  const { data: apps, isLoading, error } = useListAppsQuery();
  const [deleteApp] = useDeleteAppMutation();
  const { router } = useRouter();

  const handleCreate = useCallback(() => {
    router.push("/admin/apps/create");
  }, [router]);

  const handleEdit = useCallback(
    (id: number) => {
      router.push(`/admin/apps/${id}`);
    },
    [router],
  );

  const handleDelete = useCallback(
    async (id: number) => {
      if (window.confirm(t`Are you sure you want to delete this app?`)) {
        await deleteApp(id);
      }
    },
    [deleteApp],
  );

  const handleOpen = useCallback((name: string) => {
    window.open(`/apps/${encodeURIComponent(name)}`, "_blank");
  }, []);

  return (
    <Stack p="lg" gap="lg">
      <Group justify="space-between">
        <Title order={2}>{t`Apps`}</Title>
        <Button variant="filled" onClick={handleCreate}>
          {t`New app`}
        </Button>
      </Group>
      <LoadingAndErrorWrapper loading={isLoading} error={error}>
        {apps && apps.length === 0 ? (
          <Text c="text-light">{t`No apps have been created yet.`}</Text>
        ) : (
          <table className={AdminS.ContentTable}>
            <thead>
              <tr>
                <th>{t`Name`}</th>
                <th>{t`Auth Method`}</th>
                <th>{t`Published`}</th>
                <th>{t`Collection`}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {apps?.map((app) => (
                <AppRow
                  key={app.id}
                  app={app}
                  onOpen={handleOpen}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </tbody>
          </table>
        )}
      </LoadingAndErrorWrapper>
    </Stack>
  );
}

function AppRow({
  app,
  onOpen,
  onEdit,
  onDelete,
}: {
  app: App;
  onOpen: (name: string) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const { data: collection } = useGetCollectionQuery(
    { id: app.collection_id },
    { skip: !app.collection_id },
  );

  return (
    <tr>
      <td>{app.name}</td>
      <td>
        <Badge>{app.auth_method.toUpperCase()}</Badge>
      </td>
      <td>{app.published === true ? t`Published` : t`Draft`}</td>
      <td>{collection?.name ?? app.collection_id}</td>
      <td>
        <Group gap="xs" justify="flex-end">
          <Button size="xs" variant="subtle" onClick={() => onOpen(app.name)}>
            {t`Open`}
          </Button>
          <Button size="xs" variant="subtle" onClick={() => onEdit(app.id)}>
            {t`Edit`}
          </Button>
          <Button
            size="xs"
            variant="subtle"
            color="error"
            onClick={() => onDelete(app.id)}
          >
            {t`Delete`}
          </Button>
        </Group>
      </td>
    </tr>
  );
}
