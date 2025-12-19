import { t } from "ttag";

import { GroupDetailApp } from "metabase/admin/people/containers/GroupDetailApp";

export const ExternalGroupDetailApp = (props: {
  params: { groupId: number };
}) => {
  return <GroupDetailApp title={t`Tenant groups`} {...props} />;
};
