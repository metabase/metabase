import {
  useGetPermissionsGroupQuery,
  useListUserMembershipsQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";

import { GroupDetail } from "../components/GroupDetail";

export const GroupDetailApp = (props: any) => {
  const getGroupReq = useGetPermissionsGroupQuery(props.params.groupId);
  const membershipsByUserReq = useListUserMembershipsQuery();

  const error = getGroupReq.error ?? membershipsByUserReq.error;
  const isLoading = getGroupReq.isLoading ?? membershipsByUserReq.isLoading;

  return (
    <LoadingAndErrorWrapper error={error} loading={isLoading}>
      <GroupDetail
        membershipsByUser={membershipsByUserReq.data ?? {}}
        group={getGroupReq.data!}
      />
    </LoadingAndErrorWrapper>
  );
};
