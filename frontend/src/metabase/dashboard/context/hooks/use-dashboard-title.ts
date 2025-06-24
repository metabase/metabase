import { useDashboardContext } from "..";

export const useDashboardTitle = () => {
  const { dashboard } = useDashboardContext();
  return dashboard?.transient_name ?? dashboard?.name;
};
