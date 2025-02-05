import { getVirtualCardType } from "metabase/dashboard/utils";
import type { BaseDashboardCard } from "metabase-types/api";

const VIZ_WITH_CUSTOM_MAPPING_UI = ["placeholder"];

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
