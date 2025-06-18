import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/settings/components/SettingsSection";
import {
  useGetPermissionsGroupQuery,
  useListUserMembershipsQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";

import { GroupDetail } from "../components/GroupDetail";

export const GroupDetailApp = (props: any) => {
  const currentUser = useSelector(getUser);

  const getGroupReq = useGetPermissionsGroupQuery(props.params.groupId);
  const membershipsByUserReq = useListUserMembershipsQuery();

  const error = getGroupReq.error ?? membershipsByUserReq.error;
  const isLoading =
    getGroupReq.isLoading ?? membershipsByUserReq.isLoading ?? !currentUser;

  return (
    <SettingsPageWrapper
      title={t`Groups`}
      description={t`You can use groups to control your users' access to your data. Put users in groups and then go to the Permissions section to control each group's access. The Administrators and All Users groups are special default groups that can't be removed.`}
    >
      <LoadingAndErrorWrapper error={error} loading={isLoading}>
        {currentUser && (
          <GroupDetail
            membershipsByUser={membershipsByUserReq.data ?? {}}
            group={getGroupReq.data!}
            currentUser={currentUser}
          />
        )}
      </LoadingAndErrorWrapper>
    </SettingsPageWrapper>
  );
};
