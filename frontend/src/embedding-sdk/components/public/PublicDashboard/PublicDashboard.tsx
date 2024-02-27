import { default as InternalPublicDashboard } from "metabase/public/containers/PublicDashboard";
import type { Dashboard } from "metabase-types/api";

export const PublicDashboard = ({
  dashboardId,
  uuid,
  location = {
    pathname: "",
    search: "?created_at=&plan=&source=&trial_converted=",
    hash: "",
    action: "",
    key: "",
    query: {
      created_at: "",
      plan: "",
      source: "",
      trial_converted: "",
    },
  },
}: {
  dashboardId: Dashboard["id"];
  uuid: Dashboard["public_uuid"];
  location?: {
    search: string;
    hash: string;
    pathname: string;
    query: Record<string, string>;
    action: string;
    key: string;
  };
}) => (
  <InternalPublicDashboard
    params={{
      dashboardId,
      uuid,
    }}
    location={location}
  />
);
