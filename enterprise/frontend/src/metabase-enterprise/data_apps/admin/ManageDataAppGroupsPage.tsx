import { useState } from "react";
import { t } from "ttag";

import { AdminPaneLayout } from "metabase/admin/components/AdminPaneLayout";
import { Breadcrumbs } from "metabase/common/components/Breadcrumbs";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useToast } from "metabase/common/hooks";
import { useParams } from "metabase/router";
import { SettingsPageWrapper } from "metabase/settings-components";
import { Box, Button, Stack, Text } from "metabase/ui";
import {
  useAddDataAppGroupsMutation,
  useGetDataAppGroupsQuery,
  useGetDataAppQuery,
  useRemoveDataAppGroupMutation,
} from "metabase-enterprise/api";
import type { DataAppGroup } from "metabase-types/api";

import { DataAppGroupList } from "./components/DataAppGroupList/DataAppGroupList";

export const ManageDataAppGroupsPage = () => {
  const { slug = "" } = useParams<{ slug: string }>();
  const appRequest = useGetDataAppQuery(slug);

  const groupRequest = useGetDataAppGroupsQuery(slug);

  const error = appRequest.error ?? groupRequest.error;
  const isLoading = appRequest.isLoading || groupRequest.isLoading;

  return (
    <SettingsPageWrapper>
      <LoadingAndErrorWrapper error={error} loading={isLoading}>
        {appRequest.data && groupRequest.data && (
          <DataAppGroups
            appName={slug}
            appTitle={appRequest.data.display_name}
            groups={groupRequest.data}
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
}: {
  appName: string;
  appTitle: string;
  groups: DataAppGroup[];
}) => {
  const [sendToast] = useToast();
  const [isAdding, setIsAdding] = useState(false);

  const [addGroups] = useAddDataAppGroupsMutation();
  const [removeGroup] = useRemoveDataAppGroupMutation();

  const handleAddGroups = async (groupIds: number[]) => {
    const { error } = await addGroups({ name: appName, group_ids: groupIds });

    if (error) {
      sendToast({ message: t`Failed to add groups`, icon: "warning" });
      return false;
    }

    setIsAdding(false);
    return true;
  };

  const handleRemoveGroup = async (group: DataAppGroup) => {
    const { error } = await removeGroup({ name: appName, group_id: group.id });

    if (error) {
      sendToast({ message: t`Failed to remove group`, icon: "warning" });
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
            {t`Manage access to ${appTitle}`}
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
