import { t } from "ttag";

import {
  useGetPermissionsGroupQuery,
  useListUserMembershipsQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getUser } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { useParams } from "metabase/router";
import { SettingsPageWrapper } from "metabase/settings-components/SettingsSection";

import { GroupDetail } from "../components/GroupDetail";

export const GroupDetailApp = ({ title }: { title?: string }) => {
  const { groupId } = useParams<{ groupId: string }>();
  const currentUser = useSelector(getUser);

  const getGroupReq = useGetPermissionsGroupQuery(Number(groupId));
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
