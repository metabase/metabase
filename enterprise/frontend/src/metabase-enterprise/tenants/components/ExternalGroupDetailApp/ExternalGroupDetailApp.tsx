import { t } from "ttag";

import { GroupDetailApp } from "metabase/admin/people/containers/GroupDetailApp";

export const ExternalGroupDetailApp = () => {
  return <GroupDetailApp title={t`Tenant groups`} />;
};
