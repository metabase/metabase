import { useDashboardContext } from "metabase/dashboard/context";

export const Description = () => {
  const { dashboard } = useDashboardContext();

  return <>{dashboard?.description}</>;
};
