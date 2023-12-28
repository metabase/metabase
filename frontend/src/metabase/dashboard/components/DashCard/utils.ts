import type { DashboardCard } from "metabase-types/api";
import { getVirtualCardType } from "metabase/dashboard/utils";

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
