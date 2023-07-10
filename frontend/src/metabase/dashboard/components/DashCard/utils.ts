import type { DashboardOrderedCard } from "metabase-types/api";

export function shouldShowParameterMapper({
  dashcard,
  isEditingParameter,
}: {
  dashcard: DashboardOrderedCard;
  isEditingParameter?: boolean;
}) {
  return isEditingParameter && dashcard?.card?.display !== "heading";
}
