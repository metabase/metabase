import { useCallback } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { useGetCollectionQuery, useListAppsQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import AdminS from "metabase/css/admin.module.css";
import { useRouter } from "metabase/router";
import { Badge, Button, Group, Stack, Text, Title } from "metabase/ui";
import type { App } from "metabase-types/api/admin";

export function AppsList() {
  const { data: apps, isLoading, error } = useListAppsQuery();
  const { router } = useRouter();

  const handleCreate = useCallback(() => {
    router.push("/admin/apps/create");
  }, [router]);

  const handleConfigure = useCallback(
    (id: number) => {
      router.push(`/admin/apps/${id}`);
    },
    [router],
  );

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
                <AppRow key={app.id} app={app} onConfigure={handleConfigure} />
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
  onConfigure,
}: {
  app: App;
  onConfigure: (id: number) => void;
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
          <Button
            size="xs"
            variant="subtle"
            onClick={() => onConfigure(app.id)}
          >
            {t`Configure`}
          </Button>
          <Button
            variant="subtle"
            p={0}
            component={Link}
            to={`/apps/${app.name}`}
            target="_blank"
          >
            {t`Open`}
          </Button>
        </Group>
      </td>
    </tr>
  );
}
