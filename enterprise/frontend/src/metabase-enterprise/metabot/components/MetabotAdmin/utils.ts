import { useSelector } from "metabase/lib/redux";
import { getLocation } from "metabase/selectors/routing";

export function useMetabotIdPath() {
  const location = useSelector(getLocation);
  const metabotId = Number(location?.pathname?.split("/").pop());
  return Number.isNaN(metabotId) ? null : metabotId;
}
