import { useDashboardContext } from "metabase/dashboard/context";

export const Title = () => {
  const { dashboard } = useDashboardContext();

  return <>{dashboard?.name}</>;
};
