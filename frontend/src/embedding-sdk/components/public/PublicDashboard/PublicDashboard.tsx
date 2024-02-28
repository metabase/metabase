import type { Location } from "history";
import { PublicDashboard as InternalPublicDashboard } from "metabase/public/containers/PublicDashboard";
import type { Dashboard } from "metabase-types/api";

export const PublicDashboard = ({
  uuid,
  location = {
    pathname: "",
    search: "?created_at=&plan=&source=&trial_converted=",
    hash: "",
    action: "REPLACE",
    key: "",
    query: {
      created_at: "",
      plan: "",
      source: "",
      trial_converted: "",
    },
    state: null,
  },
}: {
  uuid: Dashboard["public_uuid"];
  location?: Location;
}) => (
  <InternalPublicDashboard
    uuid={uuid}
    location={location}
  />
);
