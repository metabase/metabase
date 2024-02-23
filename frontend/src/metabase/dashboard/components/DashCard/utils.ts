import { getVirtualCardType } from "metabase/dashboard/utils";
import type { DashboardOrderedCard } from "metabase-types/api";

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
