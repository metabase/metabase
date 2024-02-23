import { getVirtualCardType } from "metabase/dashboard/utils";
import type { DashboardCard } from "metabase-types/api";

export function shouldShowParameterMapper({
  dashcard,
  isEditingParameter,
}: {
  dashcard: DashboardCard;
  isEditingParameter?: boolean;
}) {
  return (
    isEditingParameter && !["link"].includes(getVirtualCardType(dashcard) ?? "")
  );
}
