import type {Location} from "history"
import {PublicDashboard} from "metabase/public/containers/PublicDashboard";

export const PublicDashboardRouterWrapper = ({
  location,
  params: { uuid, tabSlug },
  ...rest
}: {
  location: Location;
  params: { uuid: string; tabSlug: string };
  rest: any;
}) => {
  return <PublicDashboard location={location} uuid={uuid} />;
};
