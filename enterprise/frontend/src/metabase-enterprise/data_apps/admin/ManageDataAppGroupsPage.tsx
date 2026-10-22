import { useState } from "react";
import { t } from "ttag";

import { AdminPaneLayout } from "metabase/admin/components/AdminPaneLayout";
import { Breadcrumbs } from "metabase/common/components/Breadcrumbs";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useHasTokenFeature, useToast } from "metabase/common/hooks";
import { useParams } from "metabase/router";
import { SettingsPageWrapper } from "metabase/settings-components";
import { Box, Button, Stack, Text } from "metabase/ui";
import {
  useAddDataAppGroupsMutation,
  useGetDataAppGroupsQuery,
  useListDataAppsQuery,
  useRemoveDataAppGroupMutation,
} from "metabase-enterprise/api";
import type { DataAppGroup } from "metabase-types/api";

import { DataAppGroupList } from "./components/DataAppGroupList/DataAppGroupList";

export const ManageDataAppGroupsPage = ({
  tenancy = "internal",
}: {
  tenancy?: "internal" | "external";
}) => {
  const hasTenants = useHasTokenFeature("tenants");
  const isUnavailable = tenancy === "external" && !hasTenants;
  const { slug = "" } = useParams<{ slug: string }>();

  const listQuery = useListDataAppsQuery(undefined, { skip: isUnavailable });
  const listGroupsQuery = useGetDataAppGroupsQuery(slug, {
    skip: isUnavailable,
  });

  const app = listQuery.data?.find((app) => app.name === slug);
  const isAppMissing = listQuery.isSuccess && !app;

  const error =
    (isUnavailable ? t`Tenant access is not available.` : undefined) ??
    listQuery.error ??
    listGroupsQuery.error ??
    (isAppMissing ? t`Data app not found.` : undefined);

  const isLoading = listQuery.isLoading || listGroupsQuery.isLoading;

  return (
    <SettingsPageWrapper>
      <LoadingAndErrorWrapper error={error} loading={isLoading}>
        {app && listGroupsQuery.data && (
          <DataAppGroups
            appName={slug}
            appTitle={app.display_name}
            key={tenancy}
            tenancy={tenancy}
            groups={listGroupsQuery.data.filter(
              (group) =>
                Boolean(group.is_tenant_group) === (tenancy === "external"),
            )}
          />
        )}
      </LoadingAndErrorWrapper>
    </SettingsPageWrapper>
  );
};

const DataAppGroups = ({
  appName,
  appTitle,
  groups,
  tenancy,
}: {
  appName: string;
  appTitle: string;
  groups: DataAppGroup[];
  tenancy: "internal" | "external";
}) => {
  const [sendToast] = useToast();
  const [isAdding, setIsAdding] = useState(false);

  const [addGroups] = useAddDataAppGroupsMutation();
  const [removeGroup] = useRemoveDataAppGroupMutation();

  const handleAddGroups = async (groupIds: number[]) => {
    const { error } = await addGroups({ name: appName, group_ids: groupIds });

    if (error) {
      sendToast({ message: t`Failed to add groups`, variant: "negative" });
      return false;
    }

    setIsAdding(false);

    return true;
  };

  const handleRemoveGroup = async (group: DataAppGroup) => {
    const { error } = await removeGroup({ name: appName, group_id: group.id });

    if (error) {
      sendToast({ message: t`Failed to remove group`, variant: "negative" });
    }

    return !error;
  };

  return (
    <Stack gap="xl">
      <Box px="md">
        <Breadcrumbs
          crumbs={[[t`Data apps`, "/admin/settings/apps"], [appTitle]]}
          size="large"
        />
      </Box>

      <AdminPaneLayout
        title={
          <Text component="span" fz="2rem" lh="2rem">
            {tenancy === "external"
              ? t`Manage tenant access to ${appTitle}`
              : t`Manage access to ${appTitle}`}
          </Text>
        }
        titleActions={
          <Button
            variant="filled"
            onClick={() => setIsAdding(true)}
            disabled={isAdding}
          >
            {t`Add groups`}
          </Button>
        }
      >
        <DataAppGroupList
          tenancy={tenancy}
          appName={appName}
          isAdding={isAdding}
          groups={groups}
          onAddGroups={handleAddGroups}
          onCancelAdd={() => setIsAdding(false)}
          onRemoveGroup={handleRemoveGroup}
        />
      </AdminPaneLayout>
    </Stack>
  );
};
