import { useSelector } from "metabase/lib/redux";
import { getLocation } from "metabase/selectors/routing";

export function useMetabotIdPath(): number | "playground" | null {
  const location = useSelector(getLocation);
  const pathId = location?.pathname?.split("/").pop();
  if (pathId === "playground") {
    return "playground" as const;
  }
  const metabotId = Number(pathId);
  return Number.isNaN(metabotId) ? null : metabotId;
}
