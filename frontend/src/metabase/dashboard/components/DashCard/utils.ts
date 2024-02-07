import type { BaseDashboardCard } from "metabase-types/api";
import { getVirtualCardType } from "metabase/dashboard/utils";

export function shouldShowParameterMapper({
  dashcard,
  isEditingParameter,
}: {
  dashcard: BaseDashboardCard;
  isEditingParameter?: boolean;
}) {
  return (
    isEditingParameter && !["link"].includes(getVirtualCardType(dashcard) ?? "")
  );
}
