import { useGetPermissionsGroupQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";

import { GroupDetail } from "../components/GroupDetail";

export const GroupDetailApp = (props: any) => {
  const {
    data: group,
    isLoading,
    error,
  } = useGetPermissionsGroupQuery(props.params.groupId);

  return (
    <LoadingAndErrorWrapper error={error} loading={isLoading}>
      <GroupDetail {...props} group={group} />
    </LoadingAndErrorWrapper>
  );
};
