import type { BaseDashboardCard } from "metabase-types/api";
import { getVirtualCardType } from "metabase/dashboard/utils";

const VIZ_WITH_CUSTOM_MAPPING_UI = ["placeholder", "link"];

export function shouldShowParameterMapper({
  dashcard,
  isEditingParameter,
}: {
  dashcard: BaseDashboardCard;
  isEditingParameter?: boolean;
}) {
  const display = getVirtualCardType(dashcard);
  return (
    isEditingParameter &&
    !(display && VIZ_WITH_CUSTOM_MAPPING_UI.includes(display))
  );
}
