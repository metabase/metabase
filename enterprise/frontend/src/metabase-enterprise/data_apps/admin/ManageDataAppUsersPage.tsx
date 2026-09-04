import { skipToken } from "@reduxjs/toolkit/query";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { AdminPaneLayout } from "metabase/admin/components/AdminPaneLayout";
import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import {
  useCreateMembershipMutation,
  useDeleteMembershipMutation,
  useGetPermissionsGroupQuery,
} from "metabase/api";
import { Breadcrumbs } from "metabase/common/components/Breadcrumbs";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useToast } from "metabase/common/hooks";
import { useParams } from "metabase/router";
import { Box, Button, Stack, Text } from "metabase/ui";
import { useGetDataAppQuery } from "metabase-enterprise/api";
import type { Group, Member } from "metabase-types/api";

import { DataAppUserList } from "./components/DataAppUserList/DataAppUserList";

export const ManageDataAppUsersPage = () => {
  const { slug = "" } = useParams<{ slug: string }>();
  const appRequest = useGetDataAppQuery(slug);

  const groupRequest = useGetPermissionsGroupQuery(
    appRequest.data?.permission_group_id ?? skipToken,
  );

  const error = appRequest.error ?? groupRequest.error;
  const isLoading = appRequest.isLoading || groupRequest.isLoading;

  return (
    <SettingsPageWrapper>
      <LoadingAndErrorWrapper error={error} loading={isLoading}>
        {appRequest.data && groupRequest.data && (
          <DataAppUsers
            appName={slug}
            appTitle={appRequest.data.display_name}
            group={groupRequest.data}
          />
        )}
      </LoadingAndErrorWrapper>
    </SettingsPageWrapper>
  );
};

const DataAppUsers = ({
  appName,
  appTitle,
  group,
}: {
  appName: string;
  appTitle: string;
  group: Group;
}) => {
  const [sendToast] = useToast();
  const [isAdding, setIsAdding] = useState(false);

  const [createMembership] = useCreateMembershipMutation();
  const [deleteMembership] = useDeleteMembershipMutation();

  const members = useMemo(
    () =>
      group.members.filter(({ email }) => !email.endsWith("@api-key.invalid")),
    [group.members],
  );

  const handleAddUsers = async (userIds: number[]) => {
    try {
      await Promise.all(
        userIds.map((userId) =>
          createMembership({ group_id: group.id, user_id: userId }).unwrap(),
        ),
      );

      setIsAdding(false);
    } catch {
      sendToast({ message: t`Failed to add users`, icon: "warning" });
    }
  };

  const handleRemoveUser = async (member: Member) => {
    const { error } = await deleteMembership(member);

    if (error) {
      sendToast({ message: t`Failed to remove user`, icon: "warning" });
    }
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
            {t`Manage access to this app`}
          </Text>
        }
        titleActions={
          <Button
            variant="filled"
            onClick={() => setIsAdding(true)}
            disabled={isAdding}
          >
            {t`Add users`}
          </Button>
        }
      >
        <DataAppUserList
          appName={appName}
          isAdding={isAdding}
          members={members}
          onAddUsers={handleAddUsers}
          onCancelAdd={() => setIsAdding(false)}
          onRemoveUser={handleRemoveUser}
        />
      </AdminPaneLayout>
    </Stack>
  );
};
