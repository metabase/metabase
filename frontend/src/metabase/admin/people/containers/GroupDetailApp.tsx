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
    <LoadingAndErrorWrapper error={error} loading={isLoading}>
      {currentUser && (
        <GroupDetail
          membershipsByUser={membershipsByUserReq.data ?? {}}
          group={getGroupReq.data!}
          currentUser={currentUser}
        />
      )}
    </LoadingAndErrorWrapper>
  );
};
