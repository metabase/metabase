import { useCallback } from "react";

import { useSetDashboardAttributeHandler } from "../components/Dashboard/use-set-dashboard-attribute";
import { useDashboardContext } from "../context";

export const useDashboardTitle = (): [
  string | undefined,
  (name: string) => Promise<void>,
] => {
  const { dashboard, isEditing, updateDashboard } = useDashboardContext();

  const title = dashboard?.transient_name ?? dashboard?.name;

  const setDashboardAttribute = useSetDashboardAttributeHandler();

  const setTitle = useCallback(
    async (name: string) => {
      await setDashboardAttribute("name", name);
      if (!isEditing) {
        await updateDashboard({ attributeNames: ["name"] });
      }
    },
    [setDashboardAttribute, isEditing, updateDashboard],
  );

  return [title, setTitle];
};
