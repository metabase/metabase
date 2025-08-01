import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import {
  useGetPermissionsGroupQuery,
  useListUserMembershipsQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";

import { GroupDetail } from "../components/GroupDetail";

export const GroupDetailApp = ({
  params: { groupId },
  title,
}: {
  params: { groupId: number };
  title?: string;
}) => {
  const currentUser = useSelector(getUser);

  const getGroupReq = useGetPermissionsGroupQuery(groupId);
  const membershipsByUserReq = useListUserMembershipsQuery();

  const error = getGroupReq.error ?? membershipsByUserReq.error;
  const isLoading =
    getGroupReq.isLoading ?? membershipsByUserReq.isLoading ?? !currentUser;

  return (
    <SettingsPageWrapper title={title ?? t`Groups`}>
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
