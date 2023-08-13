import type { DashboardOrderedCard } from "metabase-types/api";
import { getVirtualCardType } from "metabase/dashboard/utils";

export function shouldShowParameterMapper({
  dashcard,
  isEditingParameter,
}: {
  dashcard: DashboardOrderedCard;
  isEditingParameter?: boolean;
}) {
  return (
    isEditingParameter && !["link"].includes(getVirtualCardType(dashcard) ?? "")
  );
}
