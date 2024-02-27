import { default as InternalPublicDashboard } from "metabase/public/containers/PublicDashboard";
import type { Dashboard } from "metabase-types/api";

export const PublicDashboard = ({
  uuid,
}: {
  uuid: Dashboard["public_uuid"];
}) => {
  return (
    <InternalPublicDashboard
      params={{
        uuid,
      }}
    />
  );
};
