import { getDataStudioDashboardReturnState } from "metabase/common/data-studio/utils/return-to";
import { useNavigate } from "metabase/router";
import * as Urls from "metabase/urls";
import type { Dashboard } from "metabase-types/api";

export function useOpenDashboardEditor() {
  const navigate = useNavigate();

  return (dashboard: Pick<Dashboard, "id" | "name">) => {
    navigate(Urls.dashboard(dashboard, { editMode: true }), {
      state: getDataStudioDashboardReturnState(dashboard.id),
    });
  };
}
